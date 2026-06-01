/**
 * Oda detay modalı — "devamını göster" / karta tıklayınca açılır.
 * Cihaz, açıklama ve teknik özellikleri (specs JSON'undan) gösterir. Görsel yok.
 */
import type { Room } from '../types';

interface SpecItem {
  label: string;
  value: string;
}

const CATEGORY_LABEL: Record<Room['roomType'], string> = {
  pod: 'Tekli Pod',
  experience: 'Deneyim Alanı',
  tribune: 'Tribün',
};

function parseSpecs(raw: string | null): SpecItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is SpecItem =>
        x && typeof x.label === 'string' && typeof x.value === 'string'
    );
  } catch {
    return [];
  }
}

interface Props {
  room: Room | null;
  open: boolean;
  onClose: () => void;
  /** "Randevu Al" — sadece oda müsaitse ve handler verilirse gösterilir. */
  onBook?: (room: Room) => void;
}

export function RoomDetailModal({ room, open, onClose, onBook }: Props) {
  if (!open || !room) return null;
  const specs = parseSpecs(room.specs);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-kt-card max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-kt-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-kt-violet-700 font-bold">
              {CATEGORY_LABEL[room.roomType]}
            </div>
            <h2 className="text-2xl font-extrabold text-kt-green-900">{room.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-kt-gray-100 text-kt-gray-500"
            aria-label="Kapat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {room.equipment && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-kt-violet-100 text-kt-violet-800 text-xs font-semibold border border-kt-violet-300">
                {room.equipment}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-kt-gray-100 text-kt-gray-700 text-xs font-semibold">
              {room.capacity === 1 ? '1 kişilik' : `${room.capacity} kişilik`}
            </span>
            {room.isAvailable ? (
              <span className="badge-available">● Müsait</span>
            ) : (
              <span className="badge-unavailable">● Dolu</span>
            )}
          </div>

          {room.description && (
            <p className="text-sm text-kt-gray-600 leading-relaxed">{room.description}</p>
          )}

          {specs.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-kt-green-900 mb-2">Teknik Özellikler</h3>
              <dl className="rounded-xl border border-kt-gray-100 divide-y divide-kt-gray-100 overflow-hidden">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-start gap-4 px-4 py-2.5 odd:bg-kt-gray-50/60">
                    <dt className="text-xs font-semibold text-kt-gray-500 w-36 shrink-0">{s.label}</dt>
                    <dd className="text-sm text-kt-green-900 font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {!room.isAvailable && room.nextAvailableDate && (
            <div className="text-xs text-kt-gray-500">
              Tahmini müsaitlik: {new Date(room.nextAvailableDate).toLocaleDateString('tr-TR')}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-ghost text-sm">
              Kapat
            </button>
            {onBook && room.isAvailable && (
              <button
                type="button"
                onClick={() => onBook(room)}
                className="flex-1 btn-primary text-sm"
              >
                Randevu Al
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
