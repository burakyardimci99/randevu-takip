import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { clearCsrfCache } from '../services/api';

/**
 * Kullanıcı kayıt sayfası.
 * Sadece 'user' rolü oluşturulur — admin hesabı bu yolla yaratılamaz.
 * Backend §4 parola politikasını uygular: min 12 karakter + büyük + küçük + rakam + özel.
 */
export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Backend restart sonrası bayat CSRF token'ı temizle (Login ile aynı patern).
  useEffect(() => {
    clearCsrfCache();
  }, []);

  // Client-side parola gücü göstergesi
  const passwordChecks = {
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
  const score = Object.values(passwordChecks).filter(Boolean).length;
  const allValid = score === 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // Client-side ön doğrulama
    const newErrors: Record<string, string> = {};
    if (fullName.trim().length < 3) newErrors.fullName = 'Ad-soyad en az 3 karakter olmalı.';
    if (!email.includes('@')) newErrors.email = 'Geçerli bir e-posta girin.';
    if (!allValid) newErrors.password = 'Parola tüm kriterleri karşılamalı.';
    if (password !== passwordConfirm) newErrors.passwordConfirm = 'Parolalar eşleşmiyor.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    setLoading(true);
    try {
      const { subject } = await register({ email, password, passwordConfirm, fullName });
      toast.push('success', `Hoş geldiniz ${subject.fullName}! Hesabınız oluşturuldu.`);
      navigate('/rooms', { replace: true });
    } catch (err) {
      const e = err as { message?: string; issues?: Array<{ path: string; message: string }> };
      if (e.issues?.length) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of e.issues) {
          fieldErrors[issue.path] = issue.message;
        }
        setErrors(fieldErrors);
      } else {
        toast.push('error', e.message || 'Kayıt başarısız.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-kt-green-950">
      {/* Mekan render'ı arka plan */}
      <div className="absolute inset-0">
        <img
          src="/images/a5.jpg"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover animate-ken-burns"
          loading="eager"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-br from-kt-green-950/90 via-kt-green-800/85 to-kt-green-900/95" />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-kt-gold-500/25 rounded-full blur-3xl animate-mesh-shift" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-kt-green-400/20 rounded-full blur-3xl animate-mesh-shift" style={{ animationDelay: '4s' }} />
        <div className="absolute top-1/3 left-1/2 w-[420px] h-[420px] bg-kt-gold-600/15 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

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
              <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1.5">Kayıt Ol</h1>
              <p className="text-sm text-kt-gray-500">
                AI Lab odalarını kullanmak için kullanıcı hesabı oluşturun.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
              <div>
                <label htmlFor="fullName" className="label">Ad Soyad</label>
                <input
                  id="fullName"
                  type="text"
                  className="input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Ayşe Yılmaz"
                  maxLength={80}
                  disabled={loading}
                />
                {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
              </div>

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
                {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
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
                  autoComplete="new-password"
                  placeholder="En az 12 karakter, karmaşık"
                  maxLength={128}
                  disabled={loading}
                />
                {/* Parola gücü göstergesi */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i <= score
                              ? score === 5
                                ? 'bg-kt-green-500'
                                : score >= 3
                                ? 'bg-kt-gold-400'
                                : 'bg-red-400'
                              : 'bg-kt-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <ul className="text-xs space-y-0.5 text-kt-gray-600">
                      <li className={passwordChecks.length ? 'text-kt-green-700' : ''}>
                        {passwordChecks.length ? '✓' : '○'} En az 12 karakter
                      </li>
                      <li className={passwordChecks.upper ? 'text-kt-green-700' : ''}>
                        {passwordChecks.upper ? '✓' : '○'} Büyük harf
                      </li>
                      <li className={passwordChecks.lower ? 'text-kt-green-700' : ''}>
                        {passwordChecks.lower ? '✓' : '○'} Küçük harf
                      </li>
                      <li className={passwordChecks.digit ? 'text-kt-green-700' : ''}>
                        {passwordChecks.digit ? '✓' : '○'} Rakam
                      </li>
                      <li className={passwordChecks.special ? 'text-kt-green-700' : ''}>
                        {passwordChecks.special ? '✓' : '○'} Özel karakter (!@#$ vb.)
                      </li>
                    </ul>
                  </div>
                )}
                {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="passwordConfirm" className="label">Parola (tekrar)</label>
                <input
                  id="passwordConfirm"
                  type="password"
                  className="input"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  maxLength={128}
                  disabled={loading}
                />
                {errors.passwordConfirm && <p className="text-xs text-red-600 mt-1">{errors.passwordConfirm}</p>}
              </div>

              <button type="submit" disabled={loading || !allValid} className="btn-primary w-full">
                {loading ? 'Hesap oluşturuluyor...' : 'Hesap Oluştur'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-kt-gray-100 text-center">
              <p className="text-sm text-kt-gray-600">
                Zaten hesabın var mı?{' '}
                <Link to="/login" className="font-semibold text-kt-green-700 hover:text-kt-gold-600">
                  Giriş yap →
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-kt-gray-500 mt-6">
            Sadece kullanıcı hesabı oluşturulabilir. Admin yetkisi bu sayfa üzerinden alınamaz.
          </p>
        </div>
      </main>
    </div>
  );
}
