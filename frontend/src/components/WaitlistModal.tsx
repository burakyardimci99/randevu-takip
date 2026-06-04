/**
 * Waitlist modal — dolu bir oda için sıraya yazılma formu.
 *
 * BookingModal'a benzer ama:
 *  - Tarih = "istenen başlangıç tarihi" (oda boşalınca otomatik booking'in başlangıcı)
 *  - Endpoint farklı (/user/waitlist)
 */
import { useEffect, useState } from 'react';
import type { JoinWaitlistPayload, Room } from '../types';

const TECH_OPTIONS = [
  'Claude', 'GPT', 'Gemini', 'OpenAI', 'LangChain', 'LlamaIndex',
  'React', 'Next.js', 'Vue', 'Node.js', 'Python', 'TypeScript',
  'Postgres', 'SQLite', 'Redis', 'Docker', 'Kubernetes',
];

const todayISO = () => new Date().toISOString().slice(0, 10);

interface Props {
  room: Room | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (payload: JoinWaitlistPayload) => void | Promise<void>;
}

export function WaitlistModal({ room, open, loading, onClose, onSubmit }: Props) {
  const [periodMonths, setPeriodMonths] = useState<1 | 2 | 3>(1);
  const [desiredStartDate, setDesiredStartDate] = useState<string>(todayISO());
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [customTech, setCustomTech] = useState('');

  useEffect(() => {
    if (open) {
      setPeriodMonths(1);
      setDesiredStartDate(todayISO());
      setProjectName('');
      setProjectDescription('');
      setHelpNeeded('');
      setTechnologies([]);
      setCustomTech('');
    }
  }, [open]);

  if (!open || !room) return null;

  const toggleTech = (t: string) => {
    setTechnologies((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };
  const addCustom = () => {
    const t = customTech.trim();
    if (t && !technologies.includes(t) && technologies.length < 20) {
      setTechnologies([...technologies, t]);
    }
    setCustomTech('');
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    onSubmit({
      roomId: room.id,
      periodMonths,
      desiredStartDate,
      projectName: projectName.trim(),
      projectDescription: projectDescription.trim(),
      helpNeeded: helpNeeded.trim(),
      technologies,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-kt-card max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-kt-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-kt-gold-700 font-bold">
              Bekleme listesi · {room.code}
            </div>
            <h2 className="text-xl font-extrabold text-kt-green-900">
              {room.district} · {room.neighborhood}
            </h2>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Bu oda şu an dolu. Sıraya yazıldığınızda, oda boşalır boşalmaz
            otomatik randevu talebi oluşturulur ve sizi bilgilendiririz.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Periyot</label>
              <div className="flex gap-2">
                {[1, 2, 3].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPeriodMonths(m as 1 | 2 | 3)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      periodMonths === m
                        ? 'bg-kt-green-700 text-white border-kt-green-700'
                        : 'bg-white text-kt-green-800 border-kt-gray-200 hover:border-kt-green-300'
                    }`}
                  >
                    {m} ay
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">İstenen başlangıç tarihi</label>
              <input
                type="date"
                className="input"
                value={desiredStartDate}
                min={todayISO()}
                onChange={(e) => setDesiredStartDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Proje adı</label>
            <input
              type="text"
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              maxLength={120}
              required
              placeholder="örn: Vibe coding asistanı"
            />
          </div>

          <div>
            <label className="label">Proje açıklaması (vibe coding fikri)</label>
            <textarea
              className="input min-h-[100px]"
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              maxLength={2000}
              minLength={20}
              required
              placeholder="Projeyi ve hedeflerinizi kısaca anlatın..."
            />
            <div className="text-[10px] text-kt-gray-400 mt-1 text-right">
              {projectDescription.length} / 2000
            </div>
          </div>

          <div>
            <label className="label">Hangi konuda destek istiyorsun?</label>
            <textarea
              className="input min-h-[80px]"
              value={helpNeeded}
              onChange={(e) => setHelpNeeded(e.target.value)}
              maxLength={2000}
              minLength={10}
              required
              placeholder="Mentor, donanım, lisans, vs."
            />
          </div>

          <div>
            <label className="label">Teknolojiler</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {TECH_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTech(t)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    technologies.includes(t)
                      ? 'bg-kt-green-700 text-white border-kt-green-700'
                      : 'bg-white text-kt-green-700 border-kt-gray-200 hover:border-kt-green-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="Kendi teknoloji ekle..."
                value={customTech}
                onChange={(e) => setCustomTech(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                maxLength={40}
              />
              <button
                type="button"
                onClick={addCustom}
                className="btn-secondary text-sm"
              >
                Ekle
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-ghost text-sm"
              disabled={loading}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className="flex-1 btn-primary text-sm"
              disabled={loading || technologies.length === 0}
            >
              {loading ? 'Sıraya yazılıyor…' : 'Sıraya gir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
