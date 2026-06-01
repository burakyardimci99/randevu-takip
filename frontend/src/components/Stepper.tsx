/**
 * Stepper — çok adımlı form / onboarding akışı için adım göstergesi.
 *
 * Tasarım: 21st.dev "Stepper" + onboarding checklist patterns. Yatay layout
 * (mobile'da küçülür), tamamlanan adımlar check ikon ile vurgulanır, aktif
 * adım cyan ring ile öne çıkarılır.
 *
 * Kullanım:
 *   <Stepper
 *     steps={[
 *       { id: 'room', label: 'Oda Seç' },
 *       { id: 'project', label: 'Proje Tanımla' },
 *       { id: 'date', label: 'Tarih' },
 *       { id: 'review', label: 'Onayla' },
 *     ]}
 *     current={1}
 *   />
 */
import { Check } from 'lucide-react';

export interface StepperStep {
  id: string;
  label: string;
  /** Kısa açıklama (opsiyonel — sadece "spacious" mod'da gösterilir). */
  description?: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** Aktif adım index'i (0-based). Tamamlananlar < current, gelecekler > current. */
  current: number;
  /** Bir adıma tıklanabilir mi (back-nav için). Sadece tamamlanmış adımlara izin verir. */
  onStepClick?: (index: number) => void;
  /** Compact mod — sadece nokta + label. */
  compact?: boolean;
  className?: string;
}

export function Stepper({
  steps,
  current,
  onStepClick,
  compact = false,
  className = '',
}: StepperProps) {
  return (
    <ol className={`flex items-stretch w-full ${className}`}>
      {steps.map((step, idx) => {
        const isCompleted = idx < current;
        const isCurrent = idx === current;
        const isLast = idx === steps.length - 1;
        const clickable = onStepClick && isCompleted;

        const circleCls = isCompleted
          ? 'bg-kt-gold-500 text-white border-kt-gold-500'
          : isCurrent
            ? 'bg-white text-kt-gold-700 border-kt-gold-400 ring-4 ring-kt-gold-400/20'
            : 'bg-white text-kt-gray-400 border-kt-gray-300';

        const labelCls = isCompleted
          ? 'text-kt-gray-600'
          : isCurrent
            ? 'text-kt-green-900 font-bold'
            : 'text-kt-gray-400';

        const lineCls = isCompleted ? 'bg-kt-gold-400' : 'bg-kt-gray-200';

        return (
          <li
            key={step.id}
            className={`flex-1 flex items-start gap-0 ${isLast ? '' : 'min-w-0'}`}
          >
            <div className="flex flex-col items-center text-center flex-shrink-0">
              <button
                type="button"
                onClick={clickable ? () => onStepClick(idx) : undefined}
                disabled={!clickable}
                aria-current={isCurrent ? 'step' : undefined}
                className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-200 ${circleCls} ${clickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'} ${compact ? '' : 'shadow-sm'}`}
              >
                {isCompleted ? <Check size={14} strokeWidth={3} /> : idx + 1}
              </button>
              <div className={`mt-2 ${compact ? 'text-[10px]' : 'text-xs'} ${labelCls} max-w-[100px] leading-tight`}>
                {step.label}
              </div>
              {!compact && step.description && (
                <div className="mt-0.5 text-[10px] text-kt-gray-400 max-w-[120px] leading-tight">
                  {step.description}
                </div>
              )}
            </div>
            {!isLast && (
              <div className="flex-1 mt-4 mx-1.5 h-0.5 rounded-full transition-colors duration-200">
                <div className={`h-full w-full rounded-full ${lineCls}`} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
