import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export default function Landing() {
  return (
    <div className="min-h-screen bg-kt-green-950 text-white">
      {/* ============== HERO ============== */}
      <section className="relative min-h-screen flex flex-col overflow-hidden bg-kt-green-950">
        {/* Arkaplan görseli — logo'nun arkasındaki tema */}
        <div className="absolute inset-0">
          <img
            src="/ai-lab-bg.jpg"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover animate-ken-burns"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-kt-green-950/55 via-kt-green-900/45 to-kt-green-950/70" />
        </div>

        {/* Neural grid backdrop */}
        <div className="absolute inset-0 bg-neural-grid-dark opacity-25 pointer-events-none" />
        {/* Animated mesh */}
        <div className="absolute inset-0 bg-ai-mesh animate-mesh-shift pointer-events-none" />
        {/* Glow orbs */}
        <div className="absolute top-1/4 left-10 w-96 h-96 bg-kt-gold-400/25 rounded-full blur-[120px] animate-float-slow" />
        <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-kt-violet-500/20 rounded-full blur-[140px] animate-float-medium" />
        <div className="absolute top-10 right-1/3 w-72 h-72 bg-kt-green-600/30 rounded-full blur-[100px]" />

        {/* Scan line overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute left-0 right-0 h-32 bg-gradient-to-b from-transparent via-kt-gold-400/8 to-transparent"
            style={{ animation: 'scanLine 6s linear infinite' }}
          />
        </div>

        {/* SVG Neural Network Particles */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-30"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
              <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[...Array(8)].map((_, i) => (
            <circle
              key={i}
              cx={`${10 + i * 12}%`}
              cy={`${20 + (i % 3) * 25}%`}
              r="3"
              fill="#22D3EE"
              opacity="0.6"
            >
              <animate
                attributeName="opacity"
                values="0.2;0.8;0.2"
                dur={`${3 + (i % 4)}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}
          {[...Array(5)].map((_, i) => (
            <line
              key={`l-${i}`}
              x1={`${15 + i * 18}%`}
              y1={`${30 + (i % 2) * 25}%`}
              x2={`${30 + i * 12}%`}
              y2={`${50 + (i % 2) * 15}%`}
              stroke="url(#lineGrad)"
              strokeWidth="1"
            />
          ))}
        </svg>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 pt-10 pb-16">
          {/* ============ LOGO — HERO İLE ENTEGRE ============ */}
          {/* `mix-blend-screen`: JPEG'in dark navy alanları sayfa arka planıyla
              eşitlenir → sadece parlak kuş figürü + "YAPAY ZEKA LABORATUVARI"
              text görünür. Etrafa soft cyan + violet glow aura ile imza gibi durur. */}
          <div className="relative mb-8 group">
            {/* Çoklu yumuşak ışık halkaları — arka planla bağlantı */}
            <div className="absolute inset-0 -m-16 bg-kt-gold-400/25 rounded-full blur-[100px] animate-glow-pulse" />
            <div className="absolute inset-0 -m-12 bg-kt-violet-500/20 rounded-full blur-[80px]" />
            <div className="absolute inset-0 -m-8 bg-kt-green-600/30 rounded-full blur-[60px]" />

            {/* Yıldız parıltıları (logodaki yıldız temasını yansıtan) */}
            <svg className="absolute -top-8 -right-12 w-14 h-14 text-kt-gold-300 opacity-70" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0 L13.5 8.5 L22 12 L13.5 15.5 L12 24 L10.5 15.5 L2 12 L10.5 8.5 Z" className="animate-pulse-gold" />
            </svg>
            <svg className="absolute -bottom-6 -left-10 w-10 h-10 text-kt-gold-300/60" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0 L13.5 8.5 L22 12 L13.5 15.5 L12 24 L10.5 15.5 L2 12 L10.5 8.5 Z" />
            </svg>

            <img
              src="/ai-lab-logo.png"
              alt="Kuveyt Türk Yapay Zeka Laboratuvarı"
              className="relative h-64 md:h-80 w-auto object-contain drop-shadow-[0_0_60px_rgba(34,211,238,0.55)] transition-transform duration-700 group-hover:scale-[1.02]"
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="max-w-5xl text-center animate-fade-in">
            <div className="badge-glass-gold mb-6">
              <span className="w-2 h-2 rounded-full bg-kt-gold-400 animate-pulse-gold" />
              YAPAY ZEKA LABORATUVARI · DEMO
            </div>
            <h1 className="h-hero mb-6">
              <span className="text-white">AI Lab </span>
              <span className="text-shimmer">pod'larını</span><br />
              <span className="text-white">projen için planla.</span>
            </h1>
            <p className="h-hero-sub text-white/75 mb-6">
              Genel Müdürlük <strong className="text-white">-1D</strong> kat AILAB zone'unda{' '}
              <strong className="text-white">NVIDIA DGX SPARK</strong> ve{' '}
              <strong className="text-white">MAC STUDIO</strong> donanımlı 18 pod + 15 kişilik
              AI Deneyim Alanı. Projeni anlat, oda izni al, geleceğin gününe randevunu oluştur.
            </p>
            <div className="flex flex-wrap justify-center items-center gap-3 mb-10 text-sm">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-100 border border-cyan-400/40 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                6× NVIDIA DGX SPARK
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-100 border border-violet-400/40 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-300" />
                13× MAC STUDIO
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kt-gold-400/20 text-kt-gold-100 border border-kt-gold-400/40 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-kt-gold-300" />
                AI Deneyim Alanı (15 kişi)
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Link to="/login" className="btn-pill-primary btn-pill-lg">
                <span className="btn-pill-shimmer" />
                <span className="relative z-10 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
                  </svg>
                  Giriş Yap
                </span>
              </Link>
              <Link to="/register" className="btn-pill-outline-dark btn-pill-lg">
                <span className="btn-pill-shimmer" />
                <span className="relative z-10 flex items-center gap-2">
                  Kayıt Ol
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM20 8v6m-3-3h6"/>
                  </svg>
                </span>
              </Link>
            </div>
          </div>
        </div>

      </section>

    </div>
  );
}
