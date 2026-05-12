import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, SubjectKind } from '../types';
import { sessionStore } from '../services/storage';
import { api } from '../services/api';

interface AuthState {
  user: AuthUser | null;
  admin: AuthUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  /** Unified login — backend tipi belirler, frontend kaydeder. */
  login: (email: string, password: string) => Promise<{ kind: SubjectKind; subject: AuthUser }>;
  /** Kullanıcı kaydı (sadece user rolü). Kayıt sonrası otomatik login. */
  register: (payload: { email: string; password: string; passwordConfirm: string; fullName: string }) => Promise<{ subject: AuthUser }>;
  /** Eski yöntemler — geriye uyum için. */
  loginUser: (email: string, password: string) => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  logout: (kind: SubjectKind) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, admin: null, loading: true });

  useEffect(() => {
    const u = sessionStore.get('user');
    const a = sessionStore.get('admin');
    setState({
      user: u ? u.subject : null,
      admin: a ? a.subject : null,
      loading: false,
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    sessionStore.save(
      res.type,
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
      res.subject
    );
    setState((s) => (res.type === 'admin' ? { ...s, admin: res.subject } : { ...s, user: res.subject }));
    return { kind: res.type, subject: res.subject };
  }, []);

  const register = useCallback(async (payload: { email: string; password: string; passwordConfirm: string; fullName: string }) => {
    const res = await api.register(payload);
    sessionStore.save(
      'user',
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
      res.subject
    );
    setState((s) => ({ ...s, user: res.subject }));
    return { subject: res.subject };
  }, []);

  const loginUser = useCallback(async (email: string, password: string) => {
    const res = await api.loginUser(email, password);
    sessionStore.save(
      'user',
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
      res.user
    );
    setState((s) => ({ ...s, user: res.user }));
  }, []);

  const loginAdmin = useCallback(async (email: string, password: string) => {
    const res = await api.loginAdmin(email, password);
    sessionStore.save(
      'admin',
      { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
      res.admin
    );
    setState((s) => ({ ...s, admin: res.admin }));
  }, []);

  const logout = useCallback(async (kind: SubjectKind) => {
    if (kind === 'user') {
      await api.logoutUser();
      setState((s) => ({ ...s, user: null }));
    } else {
      await api.logoutAdmin();
      setState((s) => ({ ...s, admin: null }));
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, login, register, loginUser, loginAdmin, logout }),
    [state, login, register, loginUser, loginAdmin, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
