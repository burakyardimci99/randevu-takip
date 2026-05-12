import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import type {
  AdminUserSearchFilters,
  AdminUserUpdatePayload,
  UserListItem,
} from '../types';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function AdminUsers() {
  const toast = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [department, setDepartment] = useState<string>('');
  const [hasBookings, setHasBookings] = useState<'any' | 'yes' | 'no'>('any');
  const [departments, setDepartments] = useState<string[]>([]);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserListItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Server-side search (debounced)
  const load = useCallback(
    async (filters: AdminUserSearchFilters = {}) => {
      setLoading(true);
      try {
        const res = await api.adminListUsers(filters);
        setUsers(res.users);
      } catch (err) {
        toast.push('error', (err as Error).message || 'Kullanıcılar yüklenemedi.');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    // Departman listesini bir kere yükle (filtre dropdown için)
    api.adminListDepartments().then((r) => setDepartments(r.departments)).catch(() => undefined);
  }, []);

  // Filter state'lerinden herhangi biri değişince debounce ile yeniden çağır
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const filters: AdminUserSearchFilters = {
        q: search.trim() || undefined,
        status: filter,
        department: department || undefined,
        hasBookings,
      };
      load(filters);
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [search, filter, department, hasBookings, load]);

  const reload = useCallback(() => {
    return load({
      q: search.trim() || undefined,
      status: filter,
      department: department || undefined,
      hasBookings,
    });
  }, [load, search, filter, department, hasBookings]);

  // Client-side hesaplar (counter UX için)
  const filtered = users;
  const activeCount = users.filter((u) => u.status === 1).length;
  const disabledCount = users.length - activeCount;

  async function handleSave(input: AdminUserUpdatePayload) {
    if (!editing) return;
    setSaving(true);
    try {
      await api.adminUpdateUser(editing.id, input);
      toast.push('success', 'Kullanıcı güncellendi.');
      setEditing(null);
      await reload();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Güncelleme başarısız.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: UserListItem) {
    setActionLoading(user.id);
    try {
      await api.adminDeleteUser(user.id);
      toast.push('info', `${user.fullName} devre dışı bırakıldı.`);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRestore(user: UserListItem) {
    setActionLoading(user.id);
    try {
      await api.adminRestoreUser(user.id);
      toast.push('success', `${user.fullName} aktifleştirildi.`);
      await reload();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <AppShell kind="admin">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">Kullanıcı Yönetimi</h1>
        <p className="text-kt-gray-500">
          Tüm kullanıcıları görüntüle, düzenle veya devre dışı bırak. {users.length} kullanıcı kayıtlı.
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-2xl p-4 text-left transition-all ${
            filter === 'all' ? 'bg-kt-green-700 text-white shadow-kt-green' : 'card hover:shadow-kt-soft'
          }`}
        >
          <div className="text-3xl font-extrabold">{users.length}</div>
          <div className="text-xs uppercase tracking-wider opacity-80 mt-1">Toplam</div>
        </button>
        <button
          onClick={() => setFilter('active')}
          className={`rounded-2xl p-4 text-left transition-all ${
            filter === 'active' ? 'bg-emerald-600 text-white shadow-kt-green' : 'card hover:shadow-kt-soft'
          }`}
        >
          <div className="text-3xl font-extrabold">{activeCount}</div>
          <div className="text-xs uppercase tracking-wider opacity-80 mt-1">Aktif</div>
        </button>
        <button
          onClick={() => setFilter('disabled')}
          className={`rounded-2xl p-4 text-left transition-all ${
            filter === 'disabled' ? 'bg-kt-gray-700 text-white shadow-kt-soft' : 'card hover:shadow-kt-soft'
          }`}
        >
          <div className="text-3xl font-extrabold">{disabledCount}</div>
          <div className="text-xs uppercase tracking-wider opacity-80 mt-1">Devre dışı</div>
        </button>
      </div>

      <div className="card p-5 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
          <div className="relative md:col-span-6">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="search"
              className="input pl-11"
              placeholder="Ad, e-posta, bölüm veya unvan ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={60}
            />
          </div>
          <select
            className="input md:col-span-3"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            aria-label="Departman filtresi"
          >
            <option value="">Tüm departmanlar</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            className="input md:col-span-3"
            value={hasBookings}
            onChange={(e) => setHasBookings(e.target.value as typeof hasBookings)}
            aria-label="Booking durumu filtresi"
          >
            <option value="any">Tümü</option>
            <option value="yes">Talep oluşturanlar</option>
            <option value="no">Hiç talep olmayanlar</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-kt-gray-100 p-4 animate-pulse h-20" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-kt-gray-500">
            <div className="text-5xl mb-3">👥</div>
            Hiç kullanıcı bulunamadı.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((u) => {
              const isDisabled = u.status !== 1;
              const isLoadingThis = actionLoading === u.id;
              return (
                <div
                  key={u.id}
                  className={`rounded-xl border p-4 transition-all hover:shadow-kt-soft ${
                    isDisabled ? 'border-kt-gray-200 bg-kt-gray-50/60 opacity-75' : 'border-kt-gray-100 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      isDisabled
                        ? 'bg-kt-gray-200 text-kt-gray-600'
                        : 'bg-gradient-to-br from-kt-green-600 to-kt-green-800 text-white'
                    }`}>
                      {initials(u.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-kt-green-900 truncate">{u.fullName}</h3>
                        {u.status === 1 ? (
                          <span className="px-2 py-0.5 rounded-md bg-kt-green-100 text-kt-green-800 text-[10px] font-bold uppercase tracking-wider">
                            Aktif
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-kt-gray-200 text-kt-gray-600 text-[10px] font-bold uppercase tracking-wider">
                            Devre dışı
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-kt-gray-600 break-all">{u.email}</div>
                      <div className="text-xs text-kt-gray-500 flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {u.department && <span>📁 {u.department}</span>}
                        {u.title && <span>💼 {u.title}</span>}
                        {u.manager && <span>👤 {u.manager}</span>}
                      </div>
                      <div className="text-xs text-kt-gray-400 mt-1 flex flex-wrap gap-x-3">
                        <span>{u.bookingCount} talep</span>
                        {u.approvedBookingCount > 0 && (
                          <span className="text-emerald-600">✓ {u.approvedBookingCount}</span>
                        )}
                        {u.pendingBookingCount > 0 && (
                          <span className="text-amber-600">⏳ {u.pendingBookingCount}</span>
                        )}
                        <span>· Kayıt: {fmtDate(u.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(u)}
                        disabled={isLoadingThis}
                        className="btn-secondary text-xs"
                        title="Düzenle"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                        Düzenle
                      </button>
                      {isDisabled ? (
                        <button
                          type="button"
                          onClick={() => handleRestore(u)}
                          disabled={isLoadingThis}
                          className="btn text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
                        >
                          {isLoadingThis ? '...' : '↺ Aktifleştir'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(u)}
                          disabled={isLoadingThis}
                          className="btn text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>
                          </svg>
                          Devre Dışı
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditUserModal
          user={editing}
          loading={saving}
          onClose={() => !saving && setEditing(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-kt-green-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => !actionLoading && setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-kt-card max-w-md w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-kt-green-900 mb-1">Kullanıcıyı devre dışı bırak?</h3>
                <p className="text-sm text-kt-gray-600">
                  <span className="font-semibold">{confirmDelete.fullName}</span> ({confirmDelete.email})
                  artık giriş yapamayacak ve oturumları sonlandırılacak. Booking geçmişi korunur.
                  İstediğin zaman aktifleştirebilirsin.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={!!actionLoading} className="btn-ghost">
                Vazgeç
              </button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={!!actionLoading} className="btn-danger">
                {actionLoading ? 'İşleniyor...' : 'Evet, devre dışı bırak'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/* ============================================================
 * EDIT MODAL
 * ============================================================ */

interface EditUserModalProps {
  user: UserListItem;
  loading: boolean;
  onClose: () => void;
  onSave: (input: AdminUserUpdatePayload) => Promise<void>;
}

function EditUserModal({ user, loading, onClose, onSave }: EditUserModalProps) {
  const [form, setForm] = useState<AdminUserUpdatePayload>({
    fullName: user.fullName,
    department: user.department ?? '',
    title: user.title ?? '',
    manager: user.manager ?? '',
    phone: user.phone ?? '',
    bio: user.bio ?? '',
    projectIdea: user.projectIdea ?? '',
    status: user.status === 1 ? 1 : 3,
  });

  function setField<K extends keyof AdminUserUpdatePayload>(key: K, value: AdminUserUpdatePayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    await onSave(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-kt-green-950/70 backdrop-blur-sm animate-fade-in"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-kt-card max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-kt-gray-100 bg-gradient-to-r from-kt-green-800 to-kt-green-900 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">
                Kullanıcı Düzenle
              </div>
              <h2 className="text-2xl font-bold">{user.fullName}</h2>
              <p className="text-sm text-white/70">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto scrollbar-thin px-6 py-5 space-y-5 flex-1">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="edit-fullName" className="label">Ad Soyad</label>
              <input
                id="edit-fullName"
                type="text"
                className="input"
                value={form.fullName ?? ''}
                onChange={(e) => setField('fullName', e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="edit-status" className="label">Durum</label>
              <select
                id="edit-status"
                className="input"
                value={form.status === 3 ? '3' : '1'}
                onChange={(e) => setField('status', e.target.value === '3' ? 3 : 1)}
              >
                <option value="1">Aktif</option>
                <option value="3">Devre dışı</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-department" className="label">Bölüm</label>
              <input
                id="edit-department"
                type="text"
                className="input"
                value={form.department ?? ''}
                onChange={(e) => setField('department', e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="edit-title" className="label">Unvan</label>
              <input
                id="edit-title"
                type="text"
                className="input"
                value={form.title ?? ''}
                onChange={(e) => setField('title', e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="edit-manager" className="label">Yöneticisi</label>
              <input
                id="edit-manager"
                type="text"
                className="input"
                value={form.manager ?? ''}
                onChange={(e) => setField('manager', e.target.value)}
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="edit-phone" className="label">Telefon</label>
              <input
                id="edit-phone"
                type="tel"
                className="input"
                value={form.phone ?? ''}
                onChange={(e) => setField('phone', e.target.value)}
                maxLength={24}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-bio" className="label">Bio</label>
            <textarea
              id="edit-bio"
              className="textarea"
              rows={2}
              value={form.bio ?? ''}
              onChange={(e) => setField('bio', e.target.value)}
              maxLength={500}
            />
          </div>

          <div>
            <label htmlFor="edit-projectIdea" className="label">Proje Fikri</label>
            <textarea
              id="edit-projectIdea"
              className="textarea"
              rows={4}
              value={form.projectIdea ?? ''}
              onChange={(e) => setField('projectIdea', e.target.value)}
              maxLength={1000}
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t border-kt-gray-100 bg-kt-gray-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={loading} className="btn-ghost">
            Vazgeç
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
