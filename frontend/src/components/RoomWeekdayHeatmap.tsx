/**
 * Oda × haftanın günü müsaitlik ısı-haritası (#5c).
 *
 * Gün-bazlı booking modelinin (weekday_mask) doğal görselleştirmesi: hangi oda
 * hangi günler yoğun. Kendi tarih aralığı filtresi var (takvim filtresi üstüne).
 * Renk yoğunluğu = o gün o odayı kapsayan aktif booking sayısı / maxCount.
 */
import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { RoomHeatmap } from '../types';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysYmd(base: string, days: number): string {
  return new Date(new Date(`${base}T00:00:00Z`).getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** count/max oranına göre hücre rengi (cyan/yeşil yoğunluk). */
function cellStyle(count: number, max: number): { backgroundColor: string; color: string } {
  if (count === 0 || max === 0) {
    return { backgroundColor: 'rgb(241 245 249)', color: 'rgb(148 163 184)' }; // slate-100 / slate-400
  }
  const t = count / max; // 0..1
  // açık cyan → koyu cyan
  const alpha = 0.18 + t * 0.82;
  return {
    backgroundColor: `rgba(8, 145, 178, ${alpha})`, // cyan-600 tabanlı
    color: t > 0.5 ? 'white' : 'rgb(15 23 42)',
  };
}

export function RoomWeekdayHeatmap() {
  const [from, setFrom] = useState<string>(() => todayYmd());
  const [to, setTo] = useState<string>(() => plusDaysYmd(todayYmd(), 30));
  const [data, setData] = useState<RoomHeatmap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.roomHeatmap({ from, to });
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const busiest = useMemo(() => {
    if (!data) return null;
    return [...data.rooms].sort((a, b) => b.total - a.total)[0] ?? null;
  }, [data]);

  return (
    <div className="card p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-kt-green-900">Oda Yoğunluk Isı-Haritası</h2>
          <p className="text-[11px] text-kt-gray-500">
            Oda × haftanın günü — seçili aralıkta hangi gün ne kadar dolu.
            {busiest && (
              <>
                {' '}
                En yoğun: <span className="font-semibold text-kt-green-800">{busiest.name}</span>.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-kt-gray-500">Başlangıç</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="input py-1 px-2 text-xs w-[130px]"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-kt-gray-500">Bitiş</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="input py-1 px-2 text-xs w-[130px]"
            />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse bg-kt-gray-100 rounded-lg" />
      ) : !data || data.rooms.length === 0 ? (
        <div className="text-sm text-kt-gray-500 italic py-6 text-center">Veri yok.</div>
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full border-separate" style={{ borderSpacing: '3px' }}>
            <thead>
              <tr>
                <th className="text-left text-[11px] font-semibold text-kt-gray-500 px-2 sticky left-0 bg-white">
                  Oda
                </th>
                {DAY_LABELS.map((d, i) => (
                  <th
                    key={d}
                    className={`text-center text-[11px] font-semibold px-1 ${
                      i >= 5 ? 'text-kt-gray-400' : 'text-kt-gray-600'
                    }`}
                  >
                    {d}
                  </th>
                ))}
                <th className="text-center text-[11px] font-semibold text-kt-gray-500 px-1">Σ</th>
              </tr>
            </thead>
            <tbody>
              {data.rooms.map((room) => (
                <tr key={room.roomId}>
                  <td className="text-xs font-semibold text-kt-green-900 px-2 whitespace-nowrap sticky left-0 bg-white max-w-[160px] truncate">
                    <span className="text-kt-gray-400 font-normal">{room.code}</span> {room.name}
                  </td>
                  {room.days.map((cell) => {
                    const st = cellStyle(cell.count, data.maxCount);
                    return (
                      <td key={cell.weekday} className="p-0">
                        <div
                          className="w-9 h-9 rounded-md flex items-center justify-center text-[11px] font-bold tabular-nums mx-auto"
                          style={st}
                          title={`${room.name} · ${DAY_LABELS[cell.weekday - 1]}: ${cell.count} aktif booking`}
                        >
                          {cell.count > 0 ? cell.count : ''}
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center text-xs font-bold text-kt-green-800 tabular-nums px-1">
                    {room.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {data && data.maxCount > 0 && (
        <div className="flex items-center gap-2 mt-4 text-[11px] text-kt-gray-500">
          <span>Az</span>
          <div className="flex gap-1">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <div
                key={t}
                className="w-5 h-5 rounded"
                style={cellStyle(Math.round(t * data.maxCount), data.maxCount)}
              />
            ))}
          </div>
          <span>Yoğun (maks {data.maxCount})</span>
        </div>
      )}
    </div>
  );
}
