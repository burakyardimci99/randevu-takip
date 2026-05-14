/**
 * Booking conversation thread — admin ↔ user mesajlaşma.
 *
 * Hem BookingDetailModal'da (admin) hem UserBookings expand'da (user) kullanılır.
 * Açıldığında thread'i fetch eder, mount sonrası unread'leri "okundu" işaretler.
 * SSE event'i (booking.updated/kind:new_message) ile auto-refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { useToast } from './Toast';
import { api } from '../services/api';
import type { BookingMessage, SubjectKind } from '../types';

interface Props {
  bookingId: string;
  viewerKind: SubjectKind;
  /** Kompakt (modal içi) mod — başlık daha küçük, container daha dar. */
  compact?: boolean;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'az önce';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} dk önce`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} sa önce`;
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function BookingThread({ bookingId, viewerKind, compact = false }: Props) {
  const toast = useToast();
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = viewerKind === 'admin'
        ? await api.adminListMessages(bookingId)
        : await api.userListMessages(bookingId);
      setMessages(res.messages);
      // Karşı tarafın gönderdiklerini "okundu" işaretle
      if (res.meta.unread > 0) {
        if (viewerKind === 'admin') await api.adminMarkRead(bookingId);
        else await api.userMarkRead(bookingId);
      }
    } catch (err) {
      toast.push('error', (err as Error).message || 'Mesajlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [bookingId, viewerKind, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Yeni mesaj geldiğinde otomatik scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Real-time
  useRealtimeEvents(viewerKind, (type, data) => {
    if (type === 'booking.updated') {
      const d = data as { bookingId?: string; kind?: string };
      if (d?.bookingId === bookingId && d?.kind === 'new_message') {
        load();
      }
    }
  });

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = viewerKind === 'admin'
        ? await api.adminPostMessage(bookingId, text)
        : await api.userPostMessage(bookingId, text);
      setMessages((m) => [...m, res.message]);
      setBody('');
    } catch (err) {
      toast.push('error', (err as Error).message || 'Gönderilemedi.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`flex flex-col ${compact ? 'h-72' : 'h-96'} rounded-xl border border-kt-gray-100 bg-kt-gray-50/40 overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-2 border-b border-kt-gray-100 bg-white/60 backdrop-blur-sm flex items-center justify-between">
        <h4 className={`font-bold text-kt-green-900 flex items-center gap-2 ${compact ? 'text-sm' : 'text-base'}`}>
          <svg className="w-4 h-4 text-kt-gold-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Konuşma
        </h4>
        <span className="text-[10px] uppercase tracking-wider font-bold text-kt-gray-400">
          {messages.length} mesaj
        </span>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-kt-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-xs text-kt-gray-400 italic px-4">
            Henüz mesaj yok. {viewerKind === 'user' ? 'Admin' : 'Kullanıcı'}'ya ilk mesajı sen at.
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.authorType === viewerKind;
            return (
              <div key={m.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    m.authorType === 'admin'
                      ? 'bg-gradient-to-br from-kt-gold-400 to-kt-gold-600 text-kt-green-950'
                      : 'bg-gradient-to-br from-kt-green-700 to-kt-green-900 text-white'
                  }`}
                >
                  {initials(m.authorName)}
                </div>
                <div className={`max-w-[78%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isMine
                        ? 'bg-kt-green-700 text-white rounded-br-sm'
                        : m.authorType === 'admin'
                        ? 'bg-kt-gold-50 text-kt-green-900 border border-kt-gold-200 rounded-bl-sm'
                        : 'bg-white text-kt-green-900 border border-kt-gray-200 rounded-bl-sm'
                    }`}
                  >
                    {m.body}
                  </div>
                  <div className={`text-[10px] text-kt-gray-400 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                    {isMine ? 'Sen' : m.authorName} · {fmtTime(m.createdAt)}
                    {m.authorType === 'admin' && !isMine && (
                      <span className="ml-1 text-kt-gold-700 font-semibold">[Yönetici]</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compose */}
      <form onSubmit={handleSend} className="border-t border-kt-gray-100 p-2 bg-white">
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              viewerKind === 'admin'
                ? 'Kullanıcıya mesaj yaz...'
                : 'Admine sor / cevap ver...'
            }
            maxLength={2000}
            disabled={sending}
            className="flex-1 px-3 py-2 rounded-lg border border-kt-gray-200 text-sm focus:border-kt-gold-400 focus:ring-2 focus:ring-kt-gold-400/30 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={sending || body.trim().length === 0}
            className="btn-primary text-sm px-4"
            title="Gönder (Enter)"
          >
            {sending ? '...' : 'Gönder'}
          </button>
        </div>
      </form>
    </div>
  );
}
