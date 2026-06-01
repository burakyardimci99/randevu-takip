/**
 * Bildirim verisi — tek kaynak.
 *
 * NotificationCenter (header zil) ile AppShell (menü rozetleri) aynı veriyi
 * kullansın diye fetch/SSE/state buraya toplandı. AppShell bu hook'u BİR kez
 * çağırır; veriyi NotificationCenter'a prop olarak geçer ve nav rozetlerini
 * hesaplar — böylece çift fetch olmaz.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeEvents } from './useRealtimeEvents';
import { api } from '../services/api';
import type { AppNotification, SubjectKind } from '../types';

export interface NotificationsData {
  items: AppNotification[];
  /** Okunmamış kalıcı bildirim sayısı. */
  unread: number;
  /** Okunmamış sohbet mesajı sayısı. */
  messageUnread: number;
  reload: () => void;
  markAllRead: () => Promise<void>;
  markItemRead: (item: AppNotification) => Promise<void>;
}

export function useNotificationsData(kind: SubjectKind): NotificationsData {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const [notif, chat] = await Promise.all([
        api.listNotifications(kind),
        api.chatUnread(kind).catch(() => ({ unread: 0 })),
      ]);
      setItems(notif.items);
      setUnread(notif.unread);
      setMessageUnread(chat.unread);
    } catch {
      // sessiz — bildirim merkezi kritik yol değil
    }
  }, [kind]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  // Real-time: ilgili bir event gelince listeyi tazele.
  useRealtimeEvents(kind, () => {
    void load();
  });

  const markAllRead = useCallback(async () => {
    try {
      await api.markAllNotificationsRead(kind);
      setItems((curr) => curr.map((i) => ({ ...i, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  }, [kind]);

  const markItemRead = useCallback(
    async (item: AppNotification) => {
      if (item.read) return;
      setItems((curr) =>
        curr.map((i) => (i.id === item.id ? { ...i, read: true } : i))
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.markNotificationRead(kind, item.id);
      } catch {
        /* ignore */
      }
    },
    [kind]
  );

  return { items, unread, messageUnread, reload: load, markAllRead, markItemRead };
}
