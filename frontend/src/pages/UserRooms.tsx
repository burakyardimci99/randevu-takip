import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { BookingModal } from '../components/BookingModal';
import { RoomIllustration } from '../components/RoomIllustration';
import { WaitlistModal } from '../components/WaitlistModal';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { CreateBookingPayload, JoinWaitlistPayload, Room, RoomTheme } from '../types';

const VALID_THEMES: RoomTheme[] = ['robot', 'pc', 'neural', 'chatbot', 'data', 'brain', 'code', 'cloud', 'vector', 'agent'];
function themeOf(room: Room): RoomTheme {
  return VALID_THEMES.includes(room.theme) ? room.theme : 'agent';
}

const THEME_LABELS: Record<RoomTheme, string> = {
  robot: 'Robotics',
  pc: 'Workstation',
  neural: 'Neural Net',
  chatbot: 'Chatbot',
  data: 'Data',
  brain: 'AI Brain',
  code: 'Coding',
  cloud: 'Cloud AI',
  vector: 'Embeddings',
  agent: 'AI Agent',
};
function themeLabel(theme: RoomTheme): string {
  return THEME_LABELS[theme] ?? 'AI Lab';
}

export default function UserRooms() {
  const toast = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'available'>('all');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [waitlistRoom, setWaitlistRoom] = useState<Room | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listUserRooms();
      setRooms(res.rooms);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Odalar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Real-time: başka kullanıcı booking yapınca availability güncellensin
  useRealtimeEvents('user', (type) => {
    if (
      type === 'booking.created' ||
      type === 'booking.updated' ||
      type === 'booking.reviewed' ||
      type === 'booking.withdrawn'
    ) {
      loadRooms();
    }
  });

  async function submitWaitlist(payload: JoinWaitlistPayload) {
    setJoining(true);
    try {
      await api.joinWaitlist(payload);
      toast.push('success', 'Bekleme listesine eklendiniz. Oda boşalınca otomatik bilgilendirileceksiniz.');
      setWaitlistRoom(null);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Sıraya yazılamadı.');
    } finally {
      setJoining(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      if (filter === 'available' && !r.isAvailable) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.district.toLowerCase().includes(q) ||
        r.neighborhood.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });
  }, [rooms, search, filter]);

  async function submitBooking(payload: CreateBookingPayload) {
    setSubmitting(true);
    try {
      await api.createBooking(payload);
      toast.push('success', 'Kiralama talebiniz admin onayına gönderildi.');
      setSelectedRoom(null);
      await loadRooms();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Talep gönderilemedi.');
    } finally {
      setSubmitting(false);
    }
  }

  const availableCount = rooms.filter((r) => r.isAvailable).length;

  return (
    <AppShell kind="user">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">AI Lab Odaları</h1>
            <p className="text-kt-gray-500">
              {availableCount} / {rooms.length} oda müsait · Merkez bina
            </p>
          </div>
          <Link to="/bookings" className="btn-secondary md:hidden">
            Taleplerim →
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-kt-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="search"
              className="input pl-11"
              placeholder="Oda adı veya kod ile ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={60}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                filter === 'all' ? 'bg-kt-green-800 text-white' : 'bg-white border border-kt-gray-200 text-kt-green-700'
              }`}
            >
              Tümü ({rooms.length})
            </button>
            <button
              onClick={() => setFilter('available')}
              className={`px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                filter === 'available' ? 'bg-emerald-600 text-white' : 'bg-white border border-kt-gray-200 text-kt-green-700'
              }`}
            >
              Müsait ({availableCount})
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-3 bg-kt-gray-100 rounded w-12 mb-3" />
              <div className="h-5 bg-kt-gray-100 rounded w-3/4 mb-2" />
              <div className="h-4 bg-kt-gray-100 rounded w-1/2 mb-4" />
              <div className="h-8 bg-kt-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-xl font-bold text-kt-green-800 mb-2">Eşleşen oda bulunamadı</h3>
          <p className="text-kt-gray-500">Arama kriterlerini değiştirip tekrar deneyin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((room) => (
            <article key={room.id} className="card-hover overflow-hidden group">
              <div className="relative h-36 overflow-hidden">
                {/* Tematik AI illüstrasyonu (her oda farklı) */}
                <RoomIllustration
                  theme={themeOf(room)}
                  className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
                {/* Alt gradient — text okunabilirliği için */}
                <div className="absolute inset-0 bg-gradient-to-t from-kt-green-950/70 via-transparent to-kt-green-900/30" />

                <div className="absolute top-3 left-3">
                  <span className="px-2 py-0.5 rounded-md bg-white/25 backdrop-blur text-white text-xs font-bold tracking-wider">
                    {room.code}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  {room.isAvailable
                    ? <span className="badge-available">● Müsait</span>
                    : <span className="badge-unavailable">● Dolu</span>}
                </div>
                <div className="absolute bottom-3 left-3 text-white drop-shadow-lg">
                  <div className="text-xs opacity-85 font-medium">{room.district}</div>
                  <div className="text-lg font-bold leading-tight">{room.neighborhood}</div>
                </div>
                <div className="absolute bottom-3 right-3">
                  <span className="px-2 py-0.5 rounded-md bg-kt-gold-500/95 text-kt-green-900 text-[10px] font-bold uppercase tracking-wider">
                    {themeLabel(themeOf(room))}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <p className="text-sm text-kt-gray-600 line-clamp-2 mb-3 min-h-[40px]">
                  {room.description}
                </p>
                <div className="flex items-center justify-between text-xs text-kt-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    {room.capacity} kişi
                  </span>
                  {!room.isAvailable && room.nextAvailableDate && (
                    <span>Müsait: {new Date(room.nextAvailableDate).toLocaleDateString('tr-TR')}</span>
                  )}
                </div>
                {room.isAvailable ? (
                  <button
                    onClick={() => setSelectedRoom(room)}
                    className="btn-primary w-full text-sm"
                  >
                    Kirala
                  </button>
                ) : (
                  <button
                    onClick={() => setWaitlistRoom(room)}
                    className="w-full text-sm px-4 py-2.5 rounded-xl bg-kt-gold-50 text-kt-gold-800 border border-kt-gold-200 font-semibold hover:bg-kt-gold-100 transition-colors"
                  >
                    Sıraya gir
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <BookingModal
        room={selectedRoom}
        open={!!selectedRoom}
        loading={submitting}
        onClose={() => !submitting && setSelectedRoom(null)}
        onSubmit={submitBooking}
      />

      <WaitlistModal
        room={waitlistRoom}
        open={!!waitlistRoom}
        loading={joining}
        onClose={() => !joining && setWaitlistRoom(null)}
        onSubmit={submitWaitlist}
      />
    </AppShell>
  );
}
