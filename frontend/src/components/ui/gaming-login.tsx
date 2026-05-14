import React, { useRef, useEffect } from 'react';
import { Eye, EyeOff, Mail, Lock, User, ShieldCheck, Home } from 'lucide-react';

interface LoginFormProps {
  email: string;
  password: string;
  remember: boolean;
  loading: boolean;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onRememberChange: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDemoFill?: (which: 'user' | 'admin') => void;
  onHomeClick?: () => void;
  registerHref?: string;
  forgotHref?: string;
}

interface VideoBackgroundProps {
  videoUrl: string;
  poster?: string;
}

interface FormInputProps {
  icon: React.ReactNode;
  type: string;
  id: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
}

interface QuickButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  title?: string;
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  id: string;
}

const FormInput: React.FC<FormInputProps> = ({ icon, type, id, placeholder, value, onChange, autoComplete, maxLength, disabled, required }) => {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-kt-gold-400/60 focus:ring-2 focus:ring-kt-gold-400/20 transition-colors disabled:opacity-60"
      />
    </div>
  );
};

const QuickButton: React.FC<QuickButtonProps> = ({ icon, label, onClick, title }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex flex-col items-center justify-center gap-1 py-2 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:bg-white/10 hover:text-kt-gold-300 hover:border-kt-gold-400/40 transition-colors"
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
};

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, id }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      onClick={onChange}
      className="relative inline-block w-10 h-5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-kt-gold-400/40 rounded-full"
    >
      <span className="sr-only">Toggle remember</span>
      <div className={`absolute inset-0 rounded-full transition-colors duration-200 ease-in-out ${checked ? 'bg-kt-gold-500' : 'bg-white/20'}`}>
        <div className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out ${checked ? 'transform translate-x-5' : ''}`} />
      </div>
    </button>
  );
};

const VideoBackground: React.FC<VideoBackgroundProps> = ({ videoUrl, poster }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        // Autoplay may be blocked; poster + dark overlay remain visible.
        console.warn('Video autoplay failed:', err);
      });
    }
  }, []);
  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      {/* Dark overlay for readability + cyan/violet AI tint */}
      <div className="absolute inset-0 z-10 bg-gradient-to-br from-kt-green-950/80 via-kt-green-900/60 to-kt-green-950/85" />
      <div className="absolute inset-0 z-10 bg-neural-grid-dark opacity-20 pointer-events-none" />
      <video
        ref={videoRef}
        className="absolute inset-0 min-w-full min-h-full object-cover w-auto h-auto"
        autoPlay
        loop
        muted
        playsInline
        poster={poster}
      >
        <source src={videoUrl} type="video/mp4" />
      </video>
    </div>
  );
};

const LoginForm: React.FC<LoginFormProps> = ({
  email,
  password,
  remember,
  loading,
  onEmailChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
  onDemoFill,
  onHomeClick,
  registerHref = '/register',
  forgotHref = '#',
}) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className="relative p-8 rounded-2xl backdrop-blur-md bg-black/55 border border-white/10 shadow-2xl">
      {/* Card glow accents — AI cyan/violet vibe */}
      <div className="absolute -top-16 -right-16 w-44 h-44 bg-kt-gold-400/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-kt-violet-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold mb-2 relative group inline-block">
            <span className="absolute -inset-1 bg-gradient-to-r from-kt-gold-400/30 via-kt-violet-500/30 to-kt-gold-500/30 blur-xl opacity-75 group-hover:opacity-100 transition-all duration-500 animate-pulse" />
            <span className="relative inline-block text-3xl font-extrabold text-white">
              Kuveyt Türk <span className="text-shimmer">AI Lab</span>
            </span>
          </h2>
          <div className="text-white/80 flex flex-col items-center space-y-2 mt-3">
            <span className="relative group cursor-default">
              <span className="absolute -inset-1 bg-gradient-to-r from-kt-gold-400/20 to-kt-violet-500/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <span className="relative inline-block">Yapay zeka çalışma alanın seni bekliyor</span>
            </span>
            <div className="flex space-x-2 text-xs text-white/40">
              <span className="animate-pulse">🧠</span>
              <span className="animate-bounce">🤖</span>
              <span className="animate-pulse">✨</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5" autoComplete="on">
          <FormInput
            id="email"
            icon={<Mail className="text-white/60" size={18} />}
            type="email"
            placeholder="E-posta adresin"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            autoComplete="email"
            maxLength={254}
            disabled={loading}
            required
          />

          <div className="relative">
            <FormInput
              id="password"
              icon={<Lock className="text-white/60" size={18} />}
              type={showPassword ? 'text' : 'password'}
              placeholder="Parola"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="current-password"
              maxLength={128}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white focus:outline-none transition-colors"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ToggleSwitch
                id="remember-me"
                checked={remember}
                onChange={() => onRememberChange(!remember)}
              />
              <label
                id="remember-me-label"
                htmlFor="remember-me"
                className="text-sm text-white/80 cursor-pointer hover:text-white transition-colors select-none"
                onClick={() => onRememberChange(!remember)}
              >
                Beni hatırla
              </label>
            </div>
            <a href={forgotHref} className="text-sm text-white/70 hover:text-kt-gold-300 transition-colors">
              Parolanı mı unuttun?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full py-3 rounded-lg bg-ai-glow-btn text-white font-bold shadow-glow-cyan hover:shadow-2xl transition-all duration-200 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-kt-gold-400/50 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
            <span className="relative">{loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}</span>
          </button>
        </form>

        {(onDemoFill || onHomeClick) && (
          <div className="mt-8">
            <div className="relative flex items-center justify-center">
              <div className="border-t border-white/10 absolute w-full" />
              <div className="bg-transparent px-4 relative text-white/50 text-[11px] uppercase tracking-[0.2em]">
                hızlı erişim
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {onDemoFill && (
                <QuickButton
                  icon={<User size={18} />}
                  label="Kullanıcı"
                  title="Demo kullanıcı bilgilerini doldur"
                  onClick={() => onDemoFill('user')}
                />
              )}
              {onDemoFill && (
                <QuickButton
                  icon={<ShieldCheck size={18} />}
                  label="Admin"
                  title="Demo admin bilgilerini doldur"
                  onClick={() => onDemoFill('admin')}
                />
              )}
              {onHomeClick && (
                <QuickButton
                  icon={<Home size={18} />}
                  label="Ana sayfa"
                  title="Ana sayfaya dön"
                  onClick={onHomeClick}
                />
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-white/60">
          Hesabın yok mu?{' '}
          <a href={registerHref} className="font-semibold text-kt-gold-300 hover:text-kt-gold-200 transition-colors">
            Kayıt ol →
          </a>
        </p>
      </div>
    </div>
  );
};

const LoginPage = {
  LoginForm,
  VideoBackground,
};

export default LoginPage;
