/**
 * Bildirim Merkezi — header zil + popover.
 *
 * Veri kaynağı:
 *  - User: cevap bekleyen admin mesajları (api.userUnreadCount)
 *  - User: kendi booking'lerinin son state değişiklikleri (SSE event'leri)
 *  - Admin: yeni booking + cevap bekleyen user mesajları
 *
 * Pratik yaklaşım: state SSE event'leri ile in-memory tutulur (50 son event).
 * Sayfa yenilense de "unread count" backend'den fetch edilir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { SubjectKind } from '../types';

interface NotifyItem {
  id: string;
  icon: 'message' | 'booking' | 'waitlist' | 'system';
  title: string;
  body: string;
  link?: string;
  createdAt: number;
  unread: boolean;
}

interface Props {
  kind: SubjectKind;
}

const STORAGE_KEY = (k: SubjectKind) => `klab:notify:${k}`;

function loadFromStorage(kind: SubjectKind): NotifyItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(kind));
    if (!raw) return [];
    return JSON.parse(raw) as NotifyItem[];
  } catch {
    return [];
  }
}
function saveToStorage(kind: SubjectKind, items: NotifyItem[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY(kind), JSON.stringify(items.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'az önce';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} sa önce`;
  return new Date(ms).toLocaleDateString('tr-TR');
}

export function NotificationCenter({ kind }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotifyItem[]>(() => loadFromStorage(kind));
  const [open, setOpen] = useState(false);
  const [serverUnread, setServerUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Sayfa yenilenince server'dan unread count
  const refreshServerUnread = useCallback(async () => {
    try {
      const res = kind === 'admin' ? await api.adminUnreadCount() : await api.userUnreadCount();
      setServerUnread(res.unread);
    } catch {
      // ignore
    }
  }, [kind]);

  useEffect(() => {
    refreshServerUnread();
    const t = window.setInterval(refreshServerUnread, 60_000);
    return () => window.clearInterval(t);
  }, [refreshServerUnread]);

  // Real-time
  useRealtimeEvents(kind, (type, data) => {
    const d = (data ?? {}) as { bookingId?: string; status?: string; kind?: string; fromWaitlist?: boolean };
    let item: NotifyItem | null = null;
    if (type === 'booking.reviewed' && kind === 'user') {
      const status = d.status ?? '';
      item = {
        id: `bookrev-${d.bookingId}-${Date.now()}`,
        icon: 'booking',
        title:
          status === 'approved'
            ? 'Talebiniz onaylandı'
            : status === 'rejected'
            ? 'Talebiniz reddedildi'
            : 'Düzeltme istendi',
        body: 'Detaylar için Taleplerim sayfasını açın.',
        link: '/bookings',
        createdAt: Date.now(),
        unread: true,
      };
    } else if (type === 'booking.created' && kind === 'admin') {
      item = {
        id: `newbook-${d.bookingId}-${Date.now()}`,
        icon: 'booking',
        title: d.fromWaitlist ? 'Bekleme listesinden yeni talep' : 'Yeni talep geldi',
        body: 'Admin paneline gidip inceleyin.',
        link: '/admin',
        createdAt: Date.now(),
        unread: true,
      };
    } else if (type === 'booking.updated' && d.kind === 'new_message') {
      item = {
        id: `msg-${d.bookingId}-${Date.now()}`,
        icon: 'message',
        title: 'Yeni mesaj geldi',
        body: 'Booking konuşmasında yeni bir mesaj var.',
        link: kind === 'admin' ? '/admin' : '/bookings',
        createdAt: Date.now(),
        unread: true,
      };
    } else if (type === 'waitlist.changed' && d.kind === 'promoted') {
      item = {
        id: `wpro-${Date.now()}`,
        icon: 'waitlist',
        title: 'Sıranız geldi',
        body: 'Bekleme listenizden talebiniz oluşturuldu.',
        link: '/bookings',
        createdAt: Date.now(),
        unread: true,
      };
    }
    if (item) {
      setItems((curr) => {
        const next = [item!, ...curr].slice(0, 50);
        saveToStorage(kind, next);
        return next;
      });
      refreshServerUnread();
    }
  });

  // Click outside → kapat
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  // ESC ile kapat
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const localUnread = items.filter((i) => i.unread).length;
  const totalUnread = serverUnread + localUnread;
  const hasAny = items.length > 0 || totalUnread > 0;

  function markAllRead() {
    setItems((curr) => {
      const next = curr.map((i) => ({ ...i, unread: false }));
      saveToStorage(kind, next);
      return next;
    });
  }

  function clickItem(item: NotifyItem) {
    setItems((curr) => {
      const next = curr.map((i) => (i.id === item.id ? { ...i, unread: false } : i));
      saveToStorage(kind, next);
      return next;
    });
    if (item.link) navigate(item.link);
    setOpen(false);
  }

  function clearAll() {
    setItems([]);
    saveToStorage(kind, []);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-kt-gold-300 transition-colors"
        aria-label="Bildirimler"
        title="Bildirimler"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-kt-green-950">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[500px] rounded-2xl bg-white shadow-2xl border border-kt-gray-200 overflow-hidden flex flex-col z-50 animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-kt-gray-100 flex items-center justify-between bg-gradient-to-r from-kt-green-50 to-white">
            <div>
              <h3 className="font-bold text-kt-green-900 text-sm">Bildirimler</h3>
              {totalUnread > 0 && (
                <div className="text-[10px] text-kt-gray-500">{totalUnread} okunmamış</div>
              )}
            </div>
            <div className="flex gap-2 text-[11px]">
              {localUnread > 0 && (
                <button onClick={markAllRead} className="text-kt-green-700 hover:text-kt-gold-700 font-semibold">
                  Hepsini okundu yap
                </button>
              )}
              {items.length > 0 && (
                <button onClick={clearAll} className="text-rose-500 hover:text-rose-700 font-semibold">
                  Temizle
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          {!hasAny ? (
            <div className="p-8 text-center text-sm text-kt-gray-500">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-kt-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div>Bildirim yok</div>
              <div className="text-[10px] text-kt-gray-400 mt-1">
                Yeni mesaj veya talep değişimlerinde burada görünür.
              </div>
            </div>
          ) : (
            <div className="overflow-y-auto scrollbar-thin flex-1">
              {serverUnread > 0 && (
                <div className="px-4 py-2 bg-kt-gold-50 border-b border-kt-gold-100 text-xs text-kt-gold-800">
                  <strong>{serverUnread}</strong> okunmamış mesaj var.
                  <button
                    onClick={() => {
                      navigate(kind === 'admin' ? '/admin' : '/bookings');
                      setOpen(false);
                    }}
                    className="ml-2 font-bold underline"
                  >
                    Aç
                  </button>
                </div>
              )}
              <ul>
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      onClick={() => clickItem(it)}
                      className={`w-full text-left px-4 py-3 border-b border-kt-gray-50 hover:bg-kt-gray-50 transition-colors flex items-start gap-3 ${
                        it.unread ? 'bg-kt-gold-50/30' : ''
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          it.icon === 'message'
                            ? 'bg-blue-100 text-blue-700'
                            : it.icon === 'booking'
                            ? 'bg-kt-gold-100 text-kt-gold-700'
                            : it.icon === 'waitlist'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-kt-gray-100 text-kt-gray-600'
                        }`}
                      >
                        <NotifyIcon icon={it.icon} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-kt-green-900 truncate flex items-center gap-1.5">
                          {it.title}
                          {it.unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                        </div>
                        <div className="text-xs text-kt-gray-500 truncate">{it.body}</div>
                        <div className="text-[10px] text-kt-gray-400 mt-0.5">
                          {fmtRelative(it.createdAt)}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifyIcon({ icon }: { icon: NotifyItem['icon'] }) {
  const common = { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', strokeWidth: '2', viewBox: '0 0 24 24' };
  if (icon === 'message')
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    );
  if (icon === 'booking')
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    );
  if (icon === 'waitlist')
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
