import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { clearCsrfCache } from '../services/api';
import LoginPage from '@/components/ui/gaming-login';

/**
 * Tek giriş ekranı. Backend hem admins hem users tablosunu kontrol eder.
 * Login başarılıysa response.type ('user' | 'admin') dönüşüne göre yönlendirme yapılır.
 *
 * Görsel: Landing hero ile ortak arkaplan (/ai-lab-bg.jpg + ken-burns + AI mesh
 * orb'ları) + gaming-login style glass dark form card.
 */
export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sayfa açıldığında cache'lenmiş CSRF token'ı temizle. Backend restart
  // veya session geçişi sonrası bayat token kullanmamak için (bir sonraki
  // istek fresh fetch yapacak).
  useEffect(() => {
    clearCsrfCache();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { kind, subject } = await login(email, password);
      toast.push(
        'success',
        kind === 'admin'
          ? `Hoş geldiniz ${subject.fullName} — yönetim paneline yönlendiriliyorsunuz.`
          : `Hoş geldiniz ${subject.fullName}.`
      );
      navigate(kind === 'admin' ? '/admin' : '/rooms', { replace: true });
    } catch (err) {
      toast.push('error', (err as Error).message || 'Giriş başarısız.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(which: 'user' | 'admin') {
    if (which === 'user') {
      setEmail('user@klab.test');
      setPassword('Demo1234!Pass');
    } else {
      setEmail('admin@klab.test');
      setPassword('Admin1234!Pass');
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-4 py-12 overflow-hidden bg-kt-green-950">
      {/* ========== ARKAPLAN — Landing hero ile aynı ========== */}
      {/* 1. Ana görsel + ken-burns */}
      <div className="absolute inset-0">
        <img
          src="/ai-lab-bg.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover animate-ken-burns"
          loading="eager"
        />
        {/* 2. Koyu navy gradient overlay — okunabilirlik için */}
        <div className="absolute inset-0 bg-gradient-to-br from-kt-green-950/65 via-kt-green-900/55 to-kt-green-950/80" />
      </div>

      {/* 3. Neural grid */}
      <div className="absolute inset-0 bg-neural-grid-dark opacity-25 pointer-events-none" />
      {/* 4. AI mesh */}
      <div className="absolute inset-0 bg-ai-mesh animate-mesh-shift pointer-events-none" />
      {/* 5. Glow orbs */}
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-kt-gold-400/25 rounded-full blur-[120px] animate-float-slow pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-kt-violet-500/20 rounded-full blur-[140px] animate-float-medium pointer-events-none" />
      <div className="absolute top-10 right-1/3 w-72 h-72 bg-kt-green-600/30 rounded-full blur-[100px] pointer-events-none" />

      {/* Üst-sol: Landing hero ile birebir aynı inline logo treatment
          — 3 katmanlı blur halo (gold/violet/green) + yıldız parıltıları
          + cyan drop-shadow + duration-700 group-hover:scale-[1.02] */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 md:px-10 py-6">
        <Link to="/" aria-label="Ana sayfa" className="relative inline-block group">
          {/* Çoklu yumuşak ışık halkaları */}
          <div className="absolute inset-0 -m-8 bg-kt-gold-400/25 rounded-full blur-[60px] animate-glow-pulse pointer-events-none" />
          <div className="absolute inset-0 -m-6 bg-kt-violet-500/20 rounded-full blur-[48px] pointer-events-none" />
          <div className="absolute inset-0 -m-4 bg-kt-green-600/30 rounded-full blur-[36px] pointer-events-none" />

          {/* Yıldız parıltıları */}
          <svg className="absolute -top-4 -right-5 w-7 h-7 text-kt-gold-300 opacity-70 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0 L13.5 8.5 L22 12 L13.5 15.5 L12 24 L10.5 15.5 L2 12 L10.5 8.5 Z" className="animate-pulse-gold" />
          </svg>
          <svg className="absolute -bottom-3 -left-4 w-5 h-5 text-kt-gold-300/60 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0 L13.5 8.5 L22 12 L13.5 15.5 L12 24 L10.5 15.5 L2 12 L10.5 8.5 Z" />
          </svg>

          <img
            src="/ai-lab-logo.png"
            alt="Kuveyt Türk Yapay Zeka Laboratuvarı"
            className="relative h-24 md:h-28 w-auto object-contain drop-shadow-[0_0_40px_rgba(34,211,238,0.55)] transition-transform duration-700 group-hover:scale-[1.02]"
            loading="eager"
            decoding="async"
          />
        </Link>
        <Link
          to="/"
          className="text-sm font-semibold text-white/80 hover:text-kt-gold-300 transition-colors backdrop-blur-sm bg-black/20 px-3 py-1.5 rounded-lg border border-white/10"
        >
          ← Ana sayfa
        </Link>
      </header>

      {/* Merkez: glass form card */}
      <div className="relative z-20 w-full max-w-md animate-fade-in">
        <LoginPage.LoginForm
          email={email}
          password={password}
          remember={remember}
          loading={loading}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onRememberChange={setRemember}
          onSubmit={handleSubmit}
          onDemoFill={fillDemo}
          onHomeClick={() => navigate('/')}
          registerHref="/register"
        />

        <p className="text-center text-xs text-white/60 mt-6 backdrop-blur-sm bg-black/20 px-3 py-1.5 rounded-lg inline-block">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-kt-gold-400 mr-2 align-middle animate-pulse-gold" />
          Demo ortam · RS256 ile güvenli oturum · Gerçek müşteri verisi kullanmayın
        </p>
      </div>
    </div>
  );
}
