interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  /** Logo'nun arka planına beyaz card + soft shadow uygula. */
  framed?: boolean;
  /** Logonun yanında "AI Lab · Oda Kiralama" alt metnini göster. */
  showTagline?: boolean;
}

const HEIGHT_MAP = {
  sm: 'h-10',
  md: 'h-14',
  lg: 'h-20',
  xl: 'h-44', // Hero/landing için büyük gösterim
} as const;

const TAGLINE_SIZE = {
  sm: 'text-[10px]',
  md: 'text-[11px]',
  lg: 'text-xs',
  xl: 'text-base',
} as const;

export function Logo({ size = 'md', variant = 'dark', framed = false, showTagline = false }: LogoProps) {
  const heightClass = HEIGHT_MAP[size];
  const taglineSize = TAGLINE_SIZE[size];

  // Frame içine alındığında her zaman beyaz arka planlı logo (kt-logo.jpg) kullanılır
  // çünkü beyaz card içinde renkli logo daha iyi durur.
  const logoSrc = framed ? '/kt-logo.jpg' : (variant === 'light' ? '/kt-logo-dark.jpg' : '/kt-logo.jpg');

  const taglinePrimary = variant === 'light' ? 'text-kt-gold-300' : 'text-kt-gold-700';
  const taglineSecondary = variant === 'light' ? 'text-white/85' : 'text-kt-green-800';
  const divider = variant === 'light' ? 'border-white/25' : 'border-kt-green-700/15';

  const img = (
    <img
      src={logoSrc}
      alt="Kuveyt Türk"
      className={`${heightClass} w-auto object-contain shrink-0`}
      loading="eager"
      decoding="async"
    />
  );

  return (
    <div className="flex items-center gap-3">
      {framed ? (
        <div
          className={`rounded-2xl bg-white shadow-kt-soft p-2.5 transition-all ${
            variant === 'light' ? 'ring-1 ring-kt-gold-300/30' : 'border border-kt-gold-100/60'
          }`}
        >
          {img}
        </div>
      ) : (
        img
      )}
      {showTagline && (
        <div className={`pl-3 border-l ${divider} leading-tight`}>
          <div className={`font-bold tracking-wider uppercase ${taglineSize} ${taglinePrimary}`}>
            AI Lab
          </div>
          <div className={`${taglineSecondary} ${size === 'sm' ? 'text-xs' : 'text-sm'} font-semibold whitespace-nowrap`}>
            Oda Kiralama
          </div>
        </div>
      )}
    </div>
  );
}
