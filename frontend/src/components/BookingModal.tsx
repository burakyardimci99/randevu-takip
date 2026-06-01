import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { Booking, CreateBookingPayload, Room, SimilarBooking } from '../types';
import { SimilarProjectsPanel } from './SimilarProjectsPanel';

interface BookingModalProps {
  room: Room | null;
  open: boolean;
  loading: boolean;
  /** Düzenleme modu için varsa, mevcut booking verisi. Yoksa create modu. */
  editingBooking?: Booking | null;
  onClose: () => void;
  onSubmit: (payload: CreateBookingPayload) => Promise<void>;
}

/**
 * Vibe coding / AI Lab projeleri için araç ve teknoloji önerileri.
 * Öncelik AI/vibe coding araçlarında, sonra dil ve framework'ler.
 */
const TECH_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'AI Kodlama Araçları',
    items: [
      'Claude Code',
      'Cursor',
      'Google Antigravity',
      'GitHub Copilot',
      'Windsurf',
      'Replit Agent',
      'Devin',
      'Bolt.new',
      'Lovable',
      'v0 by Vercel',
      'Aider',
      'Continue',
      'Codeium',
      'Tabnine',
      'Zed AI',
      'JetBrains AI',
    ],
  },
  {
    label: 'LLM / API',
    items: [
      'Anthropic Claude',
      'OpenAI GPT',
      'Google Gemini',
      'Mistral',
      'Llama',
      'DeepSeek',
      'LangChain',
      'LlamaIndex',
      'Anthropic MCP',
    ],
  },
  {
    label: 'Framework / Dil',
    items: [
      'React', 'Next.js', 'Vue', 'Svelte',
      'Node.js', 'TypeScript', 'Python', 'Go',
      'Tailwind CSS', 'FastAPI',
    ],
  },
  {
    label: 'Altyapı',
    items: [
      'PostgreSQL', 'MongoDB', 'Redis', 'SQLite',
      'Docker', 'Vercel', 'AWS', 'GCP', 'Cloudflare',
    ],
  },
];

const TECH_OPTIONS = TECH_GROUPS.flatMap((g) => g.items);

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BookingModal({ room, open, loading, editingBooking, onClose, onSubmit }: BookingModalProps) {
  const isEditing = !!editingBooking;
  const [periodMonths, setPeriodMonths] = useState<1 | 2 | 3>(1);
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]); // varsayılan: hafta içi
  const [customTech, setCustomTech] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [similar, setSimilar] = useState<SimilarBooking[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const similarTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (editingBooking) {
        setPeriodMonths(editingBooking.periodMonths as 1 | 2 | 3);
        setStartDate(editingBooking.startDate);
        setProjectName(editingBooking.projectName);
        setProjectDescription(editingBooking.projectDescription);
        setHelpNeeded(editingBooking.helpNeeded);
        setTechnologies([...editingBooking.technologies]);
        setWeekdays(
          editingBooking.weekdays && editingBooking.weekdays.length > 0
            ? [...editingBooking.weekdays]
            : [1, 2, 3, 4, 5]
        );
      } else {
        setPeriodMonths(1);
        setStartDate(todayPlus(1));
        setProjectName('');
        setProjectDescription('');
        setHelpNeeded('');
        setTechnologies([]);
        setWeekdays([1, 2, 3, 4, 5]);
      }
      setCustomTech('');
      setErrors({});
      setSimilar([]);
    }
  }, [open, editingBooking]);

  // Debounced semantic search — proje detayı 30+ karakter olunca tetiklenir.
  useEffect(() => {
    if (!open) return;
    if (similarTimerRef.current) window.clearTimeout(similarTimerRef.current);

    const projectText = projectDescription.trim();
    if (projectText.length < 30) {
      setSimilar([]);
      return;
    }

    similarTimerRef.current = window.setTimeout(async () => {
      try {
        setSimilarLoading(true);
        const res = await api.userFindSimilar({
          projectName: projectName.trim() || 'Proje',
          projectDescription: projectText,
          technologies: technologies.length > 0 ? technologies : undefined,
          limit: 4,
          minSimilarity: 0.25,
        });
        setSimilar(res.results);
      } catch {
        setSimilar([]);
      } finally {
        setSimilarLoading(false);
      }
    }, 500);

    return () => {
      if (similarTimerRef.current) window.clearTimeout(similarTimerRef.current);
    };
  }, [open, projectName, projectDescription, technologies]);

  function toggleTech(t: string) {
    setTechnologies((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  function toggleWeekday(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  function addCustomTech() {
    const v = customTech.trim();
    if (v.length === 0) return;
    if (v.length > 40) return;
    if (!technologies.includes(v)) {
      setTechnologies((cur) => [...cur, v]);
    }
    setCustomTech('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;

    const newErrors: Record<string, string> = {};
    if (projectName.trim().length < 3) newErrors.projectName = 'Proje adı en az 3 karakter olmalı.';
    if (projectDescription.trim().length < 20) newErrors.projectDescription = 'Proje açıklaması en az 20 karakter olmalı.';
    if (helpNeeded.trim().length < 10) newErrors.helpNeeded = 'Yardım talebi en az 10 karakter olmalı.';
    if (technologies.length === 0) newErrors.technologies = 'En az bir teknoloji seçin.';
    if (weekdays.length === 0) newErrors.weekdays = 'En az bir gün seçin.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await onSubmit({
      roomId: room.id,
      periodMonths,
      weekdays: [...weekdays].sort((a, b) => a - b),
      startDate,
      projectName: projectName.trim(),
      projectDescription: projectDescription.trim(),
      helpNeeded: helpNeeded.trim(),
      technologies,
    });
  }

  if (!open || !room) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-kt-green-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-kt-card max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-kt-gray-100 bg-gradient-to-r from-kt-gold-500 to-kt-gold-600 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-90 mb-1">
                {isEditing ? 'Talebi Düzenle' : 'Randevu Talebi'} · {room.code}
              </div>
              <h2 className="text-2xl font-bold">{room.name}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              aria-label="Kapat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto scrollbar-thin px-6 py-5 space-y-5 flex-1">
          <div>
            <label className="label">Randevu Süresi</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPeriodMonths(m as 1 | 2 | 3)}
                  className={`py-3 rounded-xl font-bold transition-all ${
                    periodMonths === m
                      ? 'bg-kt-gold-500 text-white shadow-kt-gold'
                      : 'bg-kt-gray-100 text-kt-green-700 hover:bg-kt-gray-200'
                  }`}
                >
                  {m} Ay
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="start-date" className="label">Başlangıç Tarihi</label>
            <input
              id="start-date"
              type="date"
              className="input"
              value={startDate}
              min={todayPlus(0)}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">
              Hangi günler? <span className="text-kt-gray-400 font-normal">(periyot boyunca)</span>
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {[
                { d: 1, l: 'Pzt' },
                { d: 2, l: 'Sal' },
                { d: 3, l: 'Çar' },
                { d: 4, l: 'Per' },
                { d: 5, l: 'Cum' },
                { d: 6, l: 'Cmt' },
                { d: 7, l: 'Paz' },
              ].map(({ d, l }) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleWeekday(d)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    weekdays.includes(d)
                      ? 'bg-kt-gold-500 text-white shadow-kt-gold'
                      : 'bg-kt-gray-100 text-kt-green-700 hover:bg-kt-gray-200'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-kt-gray-500 mt-1.5">
              Oda yalnızca seçtiğin günlerde sana ayrılır; kalan günler başka kullanıcılara açık kalır.
            </p>
            {errors.weekdays && <p className="text-xs text-red-600 mt-1">{errors.weekdays}</p>}
          </div>

          <div>
            <label htmlFor="project-name" className="label">Proje Adı</label>
            <input
              id="project-name"
              type="text"
              className="input"
              placeholder="Ör: AI Destekli Bütçe Asistanı"
              value={projectName}
              maxLength={120}
              onChange={(e) => setProjectName(e.target.value)}
              required
            />
            {errors.projectName && <p className="text-xs text-red-600 mt-1">{errors.projectName}</p>}
          </div>

          <div>
            <label htmlFor="project-description" className="label">
              Proje Açıklaması <span className="text-kt-gray-400 font-normal">(vibe coding fikri)</span>
            </label>
            <textarea
              id="project-description"
              className="textarea"
              rows={4}
              placeholder="Kafanda nasıl bir uygulama var? Hangi problemi çözüyor, kim için?"
              value={projectDescription}
              maxLength={2000}
              onChange={(e) => setProjectDescription(e.target.value)}
              required
            />
            <div className="flex justify-between mt-1">
              {errors.projectDescription
                ? <p className="text-xs text-red-600">{errors.projectDescription}</p>
                : <span />}
              <span className="text-xs text-kt-gray-400">{projectDescription.length} / 2000</span>
            </div>
          </div>

          {/* Semantic search — projeyi yazarken benzerleri göster */}
          {projectDescription.trim().length >= 30 && (similar.length > 0 || similarLoading) && (
            <SimilarProjectsPanel results={similar} loading={similarLoading} />
          )}

          <div>
            <label htmlFor="help-needed" className="label">Hangi Konularda Yardım İstiyorsun?</label>
            <textarea
              id="help-needed"
              className="textarea"
              rows={3}
              placeholder="Ör: Mimari tasarımı, prompt engineering, deploy süreci..."
              value={helpNeeded}
              maxLength={2000}
              onChange={(e) => setHelpNeeded(e.target.value)}
              required
            />
            <div className="flex justify-between mt-1">
              {errors.helpNeeded
                ? <p className="text-xs text-red-600">{errors.helpNeeded}</p>
                : <span />}
              <span className="text-xs text-kt-gray-400">{helpNeeded.length} / 2000</span>
            </div>
          </div>

          <div>
            <label className="label">
              Kullanmak İstediğin Teknolojiler
              <span className="text-kt-gray-400 font-normal ml-1">({technologies.length} seçili)</span>
            </label>
            <div className="space-y-3 mb-2">
              {TECH_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="text-xs font-bold text-kt-gold-700 uppercase tracking-wider mb-1.5">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((t) => {
                      const active = technologies.includes(t);
                      return (
                        <button
                          type="button"
                          key={t}
                          onClick={() => toggleTech(t)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            active
                              ? 'bg-kt-gold-500 text-white shadow-kt-gold'
                              : 'bg-kt-gray-100 text-kt-green-700 hover:bg-kt-gray-200'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                placeholder="Özel teknoloji ekle..."
                value={customTech}
                maxLength={40}
                onChange={(e) => setCustomTech(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTech();
                  }
                }}
              />
              <button type="button" onClick={addCustomTech} className="btn-secondary">
                Ekle
              </button>
            </div>
            {errors.technologies && <p className="text-xs text-red-600 mt-1">{errors.technologies}</p>}
            {technologies.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {technologies.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-kt-gold-100 text-kt-gold-800 text-xs font-semibold">
                    {t}
                    <button
                      type="button"
                      onClick={() => toggleTech(t)}
                      className="hover:text-kt-gold-900"
                      aria-label={`${t} kaldır`}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-kt-gray-100 bg-kt-gray-50 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost" disabled={loading}>
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (isEditing ? 'Güncelleniyor...' : 'Gönderiliyor...') : (isEditing ? 'Değişiklikleri Kaydet' : 'Talebi Gönder')}
          </button>
        </div>
      </div>
    </div>
  );
}
