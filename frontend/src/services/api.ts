/**
 * API client.
 *
 * Güvenlik:
 * - app_security.md §6: Refresh token HttpOnly cookie'de. Frontend access token'ı
 *   memory + sessionStorage'da tutar (XSS surface dar — production'da tamamen
 *   memory'e taşınabilir).
 * - app_security.md §6: Tüm mutation (POST/PUT/DELETE) X-CSRF-Token header
 *   gönderir; double-submit token doğrulanır.
 * - Cookie credentials için `credentials: 'include'` zorunlu.
 *
 * Auto-refresh: 401 alındığında refresh endpoint çağrılır, başarılı olursa
 * orijinal istek tekrarlanır.
 */
import type {
  AdminStats,
  AdminUserUpdatePayload,
  AdminUserSearchFilters,
  AnalyticsResponse,
  ApiError,
  AuthTokens,
  AuthUser,
  Booking,
  CreateBookingPayload,
  JoinWaitlistPayload,
  MfaEnrollResult,
  MfaStatus,
  ProfileUpdatePayload,
  ReviewBookingPayload,
  Room,
  ShowcaseItem,
  SimilarBooking,
  SubjectKind,
  UserListItem,
  UserProfile,
  WaitlistEntry,
} from '../types';
import { sessionStore } from './storage';

const API_BASE = '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  kind: SubjectKind;
  auth?: boolean;
  /** Public endpoint'ler (showcase) için bypass. */
  noAuth?: boolean;
}

/* ============================================================
 * CSRF Token Cache
 * ============================================================ */

let cachedCsrfToken: string | null = null;
let csrfFetching: Promise<string | null> | null = null;

async function fetchCsrfToken(force = false): Promise<string | null> {
  if (cachedCsrfToken && !force) return cachedCsrfToken;
  if (csrfFetching && !force) return csrfFetching;

  csrfFetching = (async () => {
    try {
      const res = await fetch(`${API_BASE}/csrf`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { csrfToken?: string };
      cachedCsrfToken = data.csrfToken ?? null;
      return cachedCsrfToken;
    } catch {
      return null;
    } finally {
      csrfFetching = null;
    }
  })();

  return csrfFetching;
}

async function refreshAccess(kind: SubjectKind): Promise<boolean> {
  const session = sessionStore.get(kind);
  if (!session) return false;

  // Refresh endpoint cookie ile çalışır; access token authorization header'da gerekir
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.tokens.accessToken}`,
    },
    // Body'de refresh token göndermiyoruz — cookie kullanılıyor
    body: JSON.stringify({ refreshToken: session.tokens.refreshToken ?? '' }),
  });

  if (!res.ok) return false;
  const data = (await res.json()) as AuthTokens & { type?: SubjectKind };
  sessionStore.updateTokens(kind, {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  });
  return true;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = 'GET', body, kind, auth = true, noAuth = false } = options;
  const session = sessionStore.get(kind);
  const isMutation = method !== 'GET';

  const buildHeaders = async (): Promise<HeadersInit> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && !noAuth && session) {
      headers.Authorization = `Bearer ${session.tokens.accessToken}`;
    }
    if (isMutation && !noAuth) {
      const csrf = await fetchCsrfToken();
      if (csrf) headers['X-CSRF-Token'] = csrf;
    }
    return headers;
  };

  const doFetch = async (): Promise<Response> => {
    const headers = await buildHeaders();
    return fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  // CSRF rotated? Re-fetch and retry once.
  if (res.status === 403 && isMutation) {
    let isCsrf = false;
    try {
      const errClone = res.clone();
      const peek = (await errClone.json()) as ApiError;
      isCsrf = peek?.code === 'CSRF_INVALID';
    } catch {
      // ignore
    }
    if (isCsrf) {
      await fetchCsrfToken(true);
      res = await doFetch();
    }
  }

  // Access token expired → refresh + retry
  if (res.status === 401 && auth && !noAuth && session) {
    const ok = await refreshAccess(kind);
    if (ok) {
      res = await doFetch();
    }
  }

  if (!res.ok) {
    let payload: ApiError = { error: 'İşlem başarısız.' };
    try {
      payload = (await res.json()) as ApiError;
    } catch {
      // ignore
    }
    const error = new Error(payload.error || 'İşlem başarısız.') as Error & {
      status?: number;
      code?: string;
      issues?: ApiError['issues'];
    };
    error.status = res.status;
    error.code = payload.code;
    error.issues = payload.issues;
    throw error;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ============================================================
 * SSE — real-time stream
 * ============================================================ */

export interface SseSubscription {
  close: () => void;
  source: EventSource;
}

export function subscribeEvents(
  kind: SubjectKind,
  handler: (type: string, data: unknown) => void
): SseSubscription | null {
  const session = sessionStore.get(kind);
  if (!session) return null;
  const url = `${API_BASE}/events?access_token=${encodeURIComponent(session.tokens.accessToken)}`;
  const source = new EventSource(url, { withCredentials: true });

  const wrap = (eventName: string) => (e: MessageEvent) => {
    try {
      const data = e.data ? (JSON.parse(e.data as string) as unknown) : null;
      handler(eventName, data);
    } catch {
      handler(eventName, null);
    }
  };

  const eventNames = [
    'hello',
    'ping',
    'booking.created',
    'booking.updated',
    'booking.reviewed',
    'booking.withdrawn',
    'waitlist.changed',
  ];
  for (const n of eventNames) source.addEventListener(n, wrap(n));

  return { close: () => source.close(), source };
}

/* ============================================================
 * API client object
 * ============================================================ */

export const api = {
  async login(email: string, password: string) {
    return request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      type: SubjectKind;
      subject: AuthUser;
      mfaRequired?: boolean;
    }>('/auth/login', { method: 'POST', body: { email, password }, kind: 'user', auth: false });
  },

  async register(payload: {
    email: string;
    password: string;
    passwordConfirm: string;
    fullName: string;
  }) {
    return request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      type: 'user';
      subject: AuthUser;
    }>('/auth/register', { method: 'POST', body: payload, kind: 'user', auth: false });
  },

  async loginUser(email: string, password: string) {
    return request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: AuthUser;
    }>('/user/auth/login', {
      method: 'POST',
      body: { email, password },
      kind: 'user',
      auth: false,
    });
  },

  async loginAdmin(email: string, password: string) {
    return request<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      admin: AuthUser;
      mfaRequired?: boolean;
    }>('/admin/auth/login', {
      method: 'POST',
      body: { email, password },
      kind: 'admin',
      auth: false,
    });
  },

  async logoutUser() {
    try {
      await request('/auth/logout', { method: 'POST', kind: 'user' });
    } finally {
      sessionStore.clear('user');
    }
  },

  async logoutAdmin() {
    try {
      await request('/auth/logout', { method: 'POST', kind: 'admin' });
    } finally {
      sessionStore.clear('admin');
    }
  },

  /* ============ ROOMS / BOOKINGS ============ */

  async listUserRooms() {
    return request<{ rooms: Room[] }>('/user/rooms', { kind: 'user' });
  },

  async listUserBookings() {
    return request<{ bookings: Booking[] }>('/user/bookings', { kind: 'user' });
  },

  async createBooking(payload: CreateBookingPayload) {
    return request<{ booking: Booking }>('/user/bookings', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async updateBooking(id: string, payload: CreateBookingPayload) {
    return request<{ booking: Booking }>(`/user/bookings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
      kind: 'user',
    });
  },

  async deleteBooking(id: string) {
    return request<{ deleted: boolean }>(`/user/bookings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      kind: 'user',
    });
  },

  async toggleBookingShowcase(id: string, visible: boolean) {
    return request<{ booking: Booking }>(
      `/user/bookings/${encodeURIComponent(id)}/showcase`,
      { method: 'PUT', body: { visible }, kind: 'user' }
    );
  },

  /* ============ WAITLIST ============ */

  async listUserWaitlist() {
    return request<{ entries: WaitlistEntry[] }>('/user/waitlist', { kind: 'user' });
  },

  async joinWaitlist(payload: JoinWaitlistPayload) {
    return request<{ entry: WaitlistEntry }>('/user/waitlist', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async cancelWaitlist(id: string) {
    return request<{ cancelled: boolean }>(`/user/waitlist/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      kind: 'user',
    });
  },

  /* ============ ADMIN ============ */

  async listAdminBookings(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<{ bookings: Booking[] }>(`/admin/bookings${qs}`, { kind: 'admin' });
  },

  async reviewBooking(id: string, payload: ReviewBookingPayload) {
    return request<{ booking: Booking }>(`/admin/bookings/${id}/review`, {
      method: 'POST',
      body: payload,
      kind: 'admin',
    });
  },

  async adminStats() {
    return request<{ stats: AdminStats }>('/admin/stats', { kind: 'admin' });
  },

  async adminAnalytics() {
    return request<AnalyticsResponse>('/admin/analytics', { kind: 'admin' });
  },

  async adminListWaitlist() {
    return request<{ entries: WaitlistEntry[] }>('/admin/waitlist', { kind: 'admin' });
  },

  async toggleAdminShowcase(id: string, payload: { visible?: boolean; highlight?: boolean }) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(id)}/showcase`,
      { method: 'PUT', body: payload, kind: 'admin' }
    );
  },

  /* ============ ADMIN MFA ============ */

  async mfaStatus() {
    return request<MfaStatus>('/admin/mfa/status', { kind: 'admin' });
  },

  async mfaEnroll() {
    return request<MfaEnrollResult>('/admin/mfa/enroll', { method: 'POST', kind: 'admin' });
  },

  async mfaVerify(code: string) {
    return request<{ verified: boolean; usedBackupCode: boolean }>('/admin/mfa/verify', {
      method: 'POST',
      body: { code },
      kind: 'admin',
    });
  },

  async mfaDisable(code: string) {
    return request<{ disabled: boolean }>('/admin/mfa/disable', {
      method: 'POST',
      body: { code },
      kind: 'admin',
    });
  },

  /* ============ Profil ============ */

  async getProfile() {
    return request<{ profile: UserProfile }>('/user/profile', { kind: 'user' });
  },

  async updateProfile(payload: ProfileUpdatePayload) {
    return request<{ profile: UserProfile }>('/user/profile', {
      method: 'PUT',
      body: payload,
      kind: 'user',
    });
  },

  /* ============ Admin User Management ============ */

  async adminListUsers(filters: AdminUserSearchFilters = {}) {
    const qs = new URLSearchParams();
    if (filters.q) qs.set('q', filters.q);
    if (filters.status) qs.set('status', filters.status);
    if (filters.department) qs.set('department', filters.department);
    if (filters.hasBookings) qs.set('hasBookings', filters.hasBookings);
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ users: UserListItem[] }>(`/admin/users${query}`, { kind: 'admin' });
  },

  async adminListDepartments() {
    return request<{ departments: string[] }>('/admin/users/meta/departments', {
      kind: 'admin',
    });
  },

  async adminGetUser(id: string) {
    return request<{ user: UserProfile }>(`/admin/users/${encodeURIComponent(id)}`, {
      kind: 'admin',
    });
  },

  async adminUpdateUser(id: string, payload: AdminUserUpdatePayload) {
    return request<{ user: UserProfile }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
      kind: 'admin',
    });
  },

  async adminDeleteUser(id: string) {
    return request<{ deleted: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      kind: 'admin',
    });
  },

  async adminRestoreUser(id: string) {
    return request<{ user: UserProfile }>(
      `/admin/users/${encodeURIComponent(id)}/restore`,
      { method: 'POST', kind: 'admin' }
    );
  },

  /* ============ PUBLIC ============ */

  async showcase() {
    return request<{ items: ShowcaseItem[]; total: number }>('/public/showcase', {
      kind: 'user',
      auth: false,
      noAuth: true,
    });
  },

  async showcaseTechnologies() {
    return request<{ technologies: Array<{ technology: string; count: number }> }>(
      '/public/showcase/technologies',
      { kind: 'user', auth: false, noAuth: true }
    );
  },

  /* ============ SEMANTIC SEARCH (henüz frontend tetiklenecek) ============ */

  async userFindSimilar(payload: {
    bookingId?: string;
    projectName?: string;
    projectDescription?: string;
    technologies?: string[];
    limit?: number;
    minSimilarity?: number;
  }) {
    return request<{ results: SimilarBooking[] }>('/user/similar', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async adminFindSimilar(payload: {
    bookingId?: string;
    projectName?: string;
    projectDescription?: string;
    technologies?: string[];
    limit?: number;
    minSimilarity?: number;
  }) {
    return request<{ results: SimilarBooking[] }>('/admin/similar', {
      method: 'POST',
      body: payload,
      kind: 'admin',
    });
  },
};
