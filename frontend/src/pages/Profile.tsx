import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ProfilePhotoUpload } from '../components/ProfilePhotoUpload';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import type { ProfileUpdatePayload, UserProfile } from '../types';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function Profile() {
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProfileUpdatePayload>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getProfile();
      setProfile(res.profile);
      setForm({
        fullName: res.profile.fullName,
        department: res.profile.department ?? '',
        title: res.profile.title ?? '',
        manager: res.profile.manager ?? '',
        phone: res.profile.phone ?? '',
        bio: res.profile.bio ?? '',
        projectIdea: res.profile.projectIdea ?? '',
      });
      setDirty(false);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Profil yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function setField<K extends keyof ProfileUpdatePayload>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.updateProfile(form);
      setProfile(res.profile);
      toast.push('success', 'Profil bilgileriniz kaydedildi.');
      setDirty(false);
    } catch (err) {
      const e = err as { message?: string; issues?: Array<{ path: string; message: string }> };
      if (e.issues?.length) {
        toast.push('error', e.issues.map((i) => i.message).join(' '));
      } else {
        toast.push('error', e.message || 'Kayıt başarısız.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell kind="user">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">Profilim</h1>
          <p className="text-kt-gray-500">
            Hesap bilgilerinizi, bölümünüzü ve proje fikrinizi buradan yönetin.
          </p>
        </div>
        <a
          href="/privacy"
          className="btn-ghost text-sm flex items-center gap-2 shrink-0"
          title="KVKK — verilerimi indir veya hesabımı sil"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Gizlilik & Verilerim
        </a>
      </div>

      {loading || !profile ? (
        <div className="card p-12 animate-pulse h-96" />
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Sol: Profil özet kartı */}
          <aside className="lg:col-span-1 space-y-4">
            <div className="card p-6 text-center">
              <ProfilePhotoUpload
                current={profile.profilePhoto}
                fullName={profile.fullName}
                onChanged={(p) =>
                  setProfile((prev) => (prev ? { ...prev, profilePhoto: p } : prev))
                }
              />
              <h2 className="text-xl font-bold text-kt-green-900 mt-4">{profile.fullName}</h2>
              <p className="text-sm text-kt-gray-500 break-all mb-3">{profile.email}</p>
              <a
                href={`/u/${profile.id}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-kt-gold-700 hover:text-kt-gold-800 mb-2"
              >
                Public profilimi gör →
              </a>
              <div className="flex items-center justify-center gap-1.5">
                <span className="px-2.5 py-0.5 rounded-full bg-kt-gold-100 text-kt-gold-800 text-xs font-semibold uppercase tracking-wider">
                  {profile.role === 'user' ? 'Kullanıcı' : profile.role}
                </span>
                {profile.status === 1 ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-kt-green-100 text-kt-green-800 text-xs font-semibold uppercase tracking-wider">
                    Aktif
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-kt-gray-200 text-kt-gray-600 text-xs font-semibold uppercase tracking-wider">
                    Devre dışı
                  </span>
                )}
              </div>
              <div className="mt-5 pt-5 border-t border-kt-gray-100 text-left space-y-2 text-sm">
                {profile.department && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
                    </svg>
                    <span className="text-kt-green-800">{profile.department}</span>
                  </div>
                )}
                {profile.title && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                    </svg>
                    <span className="text-kt-green-800">{profile.title}</span>
                  </div>
                )}
                {profile.manager && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    <span className="text-kt-gray-700">Yönetici: <span className="text-kt-green-800 font-medium">{profile.manager}</span></span>
                  </div>
                )}
                {profile.phone && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                    </svg>
                    <span className="text-kt-green-800">{profile.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-kt-gray-400 pt-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  Üyelik: {fmtDate(profile.createdAt)}
                </div>
              </div>
            </div>

            {profile.bio && (
              <div className="card p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-kt-gold-700 mb-2">Hakkımda</div>
                <p className="text-sm text-kt-green-800 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
              </div>
            )}
          </aside>

          {/* Sağ: Form */}
          <form onSubmit={handleSave} className="lg:col-span-2 card p-6 md:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-kt-green-900 mb-1">Profil Bilgilerini Düzenle</h2>
              <p className="text-sm text-kt-gray-500">E-posta ve parola değişikliği için sistem yöneticisine başvurun.</p>
            </div>

            <fieldset className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-kt-gold-700">Kimlik</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fullName" className="label">Ad Soyad</label>
                  <input
                    id="fullName"
                    type="text"
                    className="input"
                    value={form.fullName ?? ''}
                    onChange={(e) => setField('fullName', e.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
                <div>
                  <label className="label">E-posta</label>
                  <input
                    type="email"
                    className="input bg-kt-gray-50 cursor-not-allowed"
                    value={profile.email}
                    disabled
                    readOnly
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-kt-gold-700">İş Bilgileri</div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="department" className="label">Bölüm / Müdürlük</label>
                  <input
                    id="department"
                    type="text"
                    className="input"
                    placeholder="Örn: Dijital Bankacılık"
                    value={form.department ?? ''}
                    onChange={(e) => setField('department', e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label htmlFor="title" className="label">Görev / Unvan</label>
                  <input
                    id="title"
                    type="text"
                    className="input"
                    placeholder="Örn: Backend Developer"
                    value={form.title ?? ''}
                    onChange={(e) => setField('title', e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label htmlFor="manager" className="label">Yöneticim</label>
                  <input
                    id="manager"
                    type="text"
                    className="input"
                    placeholder="Yönetici adı"
                    value={form.manager ?? ''}
                    onChange={(e) => setField('manager', e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="label">Dahili / Telefon</label>
                  <input
                    id="phone"
                    type="tel"
                    className="input"
                    placeholder="+90 ..."
                    value={form.phone ?? ''}
                    onChange={(e) => setField('phone', e.target.value)}
                    maxLength={24}
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-kt-gold-700">Hakkımda</div>
              <div>
                <label htmlFor="bio" className="label">Kısa biyografi</label>
                <textarea
                  id="bio"
                  className="textarea"
                  rows={3}
                  placeholder="Kendinizden, ilgi alanlarınızdan kısaca bahsedin..."
                  value={form.bio ?? ''}
                  onChange={(e) => setField('bio', e.target.value)}
                  maxLength={500}
                />
                <div className="text-right text-xs text-kt-gray-400 mt-1">{(form.bio ?? '').length} / 500</div>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-kt-gold-700">Proje Fikrim</div>
              <div>
                <label htmlFor="projectIdea" className="label">
                  AI Lab'da çalışmak istediğin proje fikri
                </label>
                <textarea
                  id="projectIdea"
                  className="textarea"
                  rows={5}
                  placeholder="Kafanda ne var? Hangi problemi çözmek istiyorsun?"
                  value={form.projectIdea ?? ''}
                  onChange={(e) => setField('projectIdea', e.target.value)}
                  maxLength={1000}
                />
                <div className="text-right text-xs text-kt-gray-400 mt-1">{(form.projectIdea ?? '').length} / 1000</div>
              </div>
            </fieldset>

            <div className="flex items-center justify-between pt-4 border-t border-kt-gray-100">
              <p className="text-xs text-kt-gray-400">
                Son güncelleme: {fmtDate(profile.updatedAt)}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={load} disabled={saving || !dirty} className="btn-ghost">
                  Vazgeç
                </button>
                <button type="submit" disabled={saving || !dirty} className="btn-primary">
                  {saving ? 'Kaydediliyor...' : dirty ? 'Değişiklikleri Kaydet' : 'Kaydedildi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
