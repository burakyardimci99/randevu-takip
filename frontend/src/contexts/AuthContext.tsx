import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, SubjectKind } from '../types';
import { sessionStore } from '../services/storage';
import { api } from '../services/api';

/**
 * Auth state — 4 ayrı oturum slotu. Her kind kendi token'ını ayrı
 * sessionStorage anahtarında saklar; aynı tarayıcıda birden fazla rolün eş
 * zamanlı oturumu mümkündür ama her biri yalnızca kendi kind'ının
 * endpoint'lerine erişebilir.
 */
interface AuthState {
  user: AuthUser | null;
  admin: AuthUser | null;
  danisman: AuthUser | null;
  arge: AuthUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (
    email: string,
    password: string
  ) => Promise<{ kind: SubjectKind; subject: AuthUser }>;
  register: (payload: {
    email: string;
    password: string;
    passwordConfirm: string;
    fullName: string;
    governanceRole?: 'analitik_danisman' | 'yz_arge';
  }) => Promise<{ kind: SubjectKind; subject: AuthUser }>;
  loginUser: (email: string, password: string) => Promise<void>;
  loginAdmin: (email: string, password: string) => Promise<void>;
  logout: (kind: SubjectKind) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ALL_KINDS: SubjectKind[] = ['user', 'admin', 'danisman', 'arge'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    admin: null,
    danisman: null,
    arge: null,
    loading: true,
  });

  useEffect(() => {
    const snapshot: Partial<AuthState> = { loading: false };
    for (const k of ALL_KINDS) {
      const s = sessionStore.get(k);
      snapshot[k] = s ? s.subject : null;
    }
    setState((curr) => ({ ...curr, ...snapshot }));
  }, []);

  const applySession = useCallback((kind: SubjectKind, subject: AuthUser) => {
    setState((s) => ({ ...s, [kind]: subject }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      sessionStore.save(
        res.type,
        { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
        res.subject
      );
      applySession(res.type, res.subject);
      return { kind: res.type, subject: res.subject };
    },
    [applySession]
  );

  const register = useCallback(
    async (payload: {
      email: string;
      password: string;
      passwordConfirm: string;
      fullName: string;
      governanceRole?: 'analitik_danisman' | 'yz_arge';
    }) => {
      const res = await api.register(payload);
      sessionStore.save(
        res.type,
        { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
        res.subject
      );
      applySession(res.type, res.subject);
      return { kind: res.type, subject: res.subject };
    },
    [applySession]
  );

  const loginUser = useCallback(
    async (email: string, password: string) => {
      const res = await api.loginUser(email, password);
      sessionStore.save(
        'user',
        { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
        res.user
      );
      applySession('user', res.user);
    },
    [applySession]
  );

  const loginAdmin = useCallback(
    async (email: string, password: string) => {
      const res = await api.loginAdmin(email, password);
      sessionStore.save(
        'admin',
        { accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn },
        res.admin
      );
      applySession('admin', res.admin);
    },
    [applySession]
  );

  const logout = useCallback(async (kind: SubjectKind) => {
    try {
      if (kind === 'admin') {
        await api.logoutAdmin();
      } else {
        // user, danisman, arge — hepsi /api/auth/logout'a düşer; ayrıca user-side
        // refresh cookie temizlenmesi gerektirebilir.
        await api.logoutUser();
      }
    } finally {
      sessionStore.clear(kind);
      setState((s) => ({ ...s, [kind]: null }));
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
