import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';

/**
 * Tek giriş ekranı. Backend hem admins hem users tablosunu kontrol eder.
 * Login başarılıysa response.type ('user' | 'admin') dönüşüne göre yönlendirme yapılır.
 */
export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

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

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-kt-green-950">
      {/* ============ ARKA PLAN ============ */}
      {/* 1. Mekan render'ı + ken-burns hareketi */}
      <div className="absolute inset-0">
        <img
          src="/images/a2.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover animate-ken-burns"
          loading="eager"
        />
      </div>
      {/* 2. Kuveyt Türk yeşili gradient overlay (text okunabilirliği için) */}
      <div className="absolute inset-0 bg-gradient-to-br from-kt-green-950/90 via-kt-green-800/85 to-kt-green-900/95" />

      {/* 3. Animated mesh — altın & yeşil yumuşak orb'lar */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-kt-gold-500/25 rounded-full blur-3xl animate-mesh-shift" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-kt-green-400/20 rounded-full blur-3xl animate-mesh-shift" style={{ animationDelay: '4s' }} />
        <div className="absolute top-1/3 left-1/2 w-[420px] h-[420px] bg-kt-gold-600/15 rounded-full blur-3xl animate-float-slow" />
      </div>

      {/* 4. İnce noktalı pattern (parmak izi gibi) */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      {/* ============ İÇERİK ============ */}
      <header className="relative z-10 px-8 py-6 flex items-center justify-between">
        <Link to="/" className="group">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-kt-gold-400/30 p-2.5 transition-all group-hover:shadow-kt-gold group-hover:-translate-y-0.5">
            <img
              src="/kt-logo.jpg"
              alt="Kuveyt Türk"
              className="h-14 w-auto object-contain"
              loading="eager"
              decoding="async"
            />
          </div>
        </Link>
        <Link to="/" className="text-sm font-semibold text-white/80 hover:text-kt-gold-300 transition-colors">
          ← Ana sayfaya dön
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-md animate-slide-up">
          <div className="rounded-2xl p-8 bg-white/95 backdrop-blur-md shadow-2xl border border-white/40">
            <div className="mb-6">
              <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1.5">Giriş Yap</h1>
              <p className="text-sm text-kt-gray-500">
                Kullanıcı veya admin hesabınızla aynı yerden giriş yapabilirsiniz.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label htmlFor="email" className="label">E-posta</label>
                <input
                  id="email"
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="ornek@klab.test"
                  maxLength={254}
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="password" className="label">Parola</label>
                <input
                  id="password"
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  maxLength={128}
                  disabled={loading}
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>

            <div className="mt-5 text-center text-sm text-kt-gray-600">
              Hesabın yok mu?{' '}
              <Link to="/register" className="font-semibold text-kt-green-700 hover:text-kt-gold-600">
                Kayıt ol →
              </Link>
            </div>

            <div className="mt-6 pt-6 border-t border-kt-gray-100">
              <button
                type="button"
                onClick={() => setShowDemo((v) => !v)}
                className="w-full text-xs text-kt-gray-500 hover:text-kt-green-700 font-semibold uppercase tracking-wider flex items-center justify-between"
              >
                <span>Demo Hesaplar</span>
                <svg className={`w-4 h-4 transition-transform ${showDemo ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
              {showDemo && (
                <div className="mt-3 space-y-2 text-sm animate-fade-in">
                  <button
                    type="button"
                    onClick={() => { setEmail('user@klab.test'); setPassword('Demo1234!Pass'); }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-kt-green-50 hover:bg-kt-green-100 border border-kt-green-100 transition-colors"
                  >
                    <div className="text-xs font-bold text-kt-green-700 uppercase tracking-wider mb-0.5">Kullanıcı</div>
                    <div className="font-mono text-kt-green-900 text-xs">user@klab.test</div>
                    <div className="font-mono text-kt-gray-500 text-xs">Demo1234!Pass</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmail('admin@klab.test'); setPassword('Admin1234!Pass'); }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-kt-gold-50 hover:bg-kt-gold-100 border border-kt-gold-100 transition-colors"
                  >
                    <div className="text-xs font-bold text-kt-gold-700 uppercase tracking-wider mb-0.5">Admin</div>
                    <div className="font-mono text-kt-green-900 text-xs">admin@klab.test</div>
                    <div className="font-mono text-kt-gray-500 text-xs">Admin1234!Pass</div>
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-kt-gray-500 mt-6">
            Bu bir demo ortamdır. Gerçek müşteri verisi kullanmayın.
          </p>
        </div>
      </main>
    </div>
  );
}
