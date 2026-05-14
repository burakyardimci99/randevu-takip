/**
 * Profil fotoğrafı yükleme component'i.
 *
 * Akış:
 *  1. <input type="file" accept="image/jpeg"> ile dosya seç
 *  2. Client-side resize: canvas ile max 400px + JPEG quality 0.85
 *  3. Boyut max 200KB (server limit)
 *  4. Backend'e dataURL POST
 *  5. Mevcut foto'yu sil için ayrı buton
 *
 * Güvenlik:
 *  - Sadece JPEG (accept attribute + magic byte server tarafta)
 *  - SVG / HTML upload yasak (XSS)
 *  - Client-side resize ile EXIF temizliği (canvas re-encode metadata atar)
 */
import { useRef, useState } from 'react';
import { useToast } from './Toast';
import { api } from '../services/api';

interface Props {
  /** Mevcut profil fotoğrafı data URL veya null. */
  current: string | null;
  /** Kullanıcı adı (placeholder initials için). */
  fullName: string;
  /** Yüklendi / silindi sonrası callback. */
  onChanged: (newDataUrl: string | null) => void;
}

const MAX_SIZE_BYTES = 200 * 1024;
const MAX_DIM = 400;

function initialsOf(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

async function fileToResizedJpegDataUrl(file: File): Promise<string> {
  // 1) FileReader → dataURL
  const orig = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });

  // 2) Image objesinde yükle
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Görsel açılamadı.'));
    i.src = orig;
  });

  // 3) Resize hesabı — kısa kenar 400px, kare crop
  const minDim = Math.min(img.width, img.height);
  const scale = MAX_DIM / minDim;
  const newW = Math.round(img.width * scale);
  const newH = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = MAX_DIM;
  canvas.height = MAX_DIM;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas desteklenmiyor.');

  // Center crop
  const sx = (newW - MAX_DIM) / 2 / scale;
  const sy = (newH - MAX_DIM) / 2 / scale;
  const sw = MAX_DIM / scale;
  const sh = MAX_DIM / scale;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, MAX_DIM, MAX_DIM);

  // 4) Iteratif quality azaltma — 200KB altına insin
  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let bytes = Math.floor(dataUrl.length * 0.75);

  while (bytes > MAX_SIZE_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    bytes = Math.floor(dataUrl.length * 0.75);
  }

  if (bytes > MAX_SIZE_BYTES) {
    throw new Error('Dosya çok büyük, daha küçük bir resim seçin.');
  }

  return dataUrl;
}

export function ProfilePhotoUpload({ current, fullName, onChanged }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hover, setHover] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/jpe?g$/i.test(file.type)) {
      toast.push('error', 'Yalnızca JPEG yükleyebilirsiniz.');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.push('error', 'Dosya 5MB üstü. Daha küçük bir resim seçin.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await fileToResizedJpegDataUrl(file);
      await api.setMyPhoto(dataUrl);
      onChanged(dataUrl);
      toast.push('success', 'Profil fotoğrafı güncellendi.');
    } catch (err) {
      toast.push('error', (err as Error).message || 'Yükleme başarısız.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleClear() {
    setUploading(true);
    try {
      await api.clearMyPhoto();
      onChanged(null);
      toast.push('info', 'Profil fotoğrafı kaldırıldı.');
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-32 h-32 rounded-3xl overflow-hidden cursor-pointer group shadow-kt-soft ring-2 ring-kt-gold-300/40 hover:ring-kt-gold-400/70 transition-all"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => !uploading && fileRef.current?.click()}
      >
        {current ? (
          <img src={current} alt="Profil fotoğrafı" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-kt-green-700 via-kt-green-800 to-kt-green-950 flex items-center justify-center text-white text-3xl font-extrabold">
            {initialsOf(fullName)}
          </div>
        )}

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-kt-green-950/85 via-kt-green-900/50 to-transparent flex flex-col items-center justify-end p-3 transition-opacity ${
            hover || uploading ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <svg className="w-7 h-7 text-white mb-1" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-white text-[11px] font-bold tracking-wider uppercase">
            {uploading ? 'Yükleniyor…' : 'Değiştir'}
          </span>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex gap-2 mt-3 text-xs">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-kt-gold-700 hover:text-kt-gold-800 font-semibold underline-offset-2 hover:underline"
        >
          JPEG yükle
        </button>
        {current && (
          <>
            <span className="text-kt-gray-300">·</span>
            <button
              type="button"
              onClick={handleClear}
              disabled={uploading}
              className="text-rose-600 hover:text-rose-700 font-semibold underline-offset-2 hover:underline"
            >
              Kaldır
            </button>
          </>
        )}
      </div>
      <p className="text-[10px] text-kt-gray-400 mt-1">Max 200 KB · sadece JPEG · 400×400 px'e küçültülür</p>
    </div>
  );
}
