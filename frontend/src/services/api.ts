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
  ApprovalType,
  AppNotification,
  AuthTokens,
  AuthUser,
  Appointment,
  Booking,
  GateKey,
  GateStatus,
  GovernanceAdmin,
  GovernanceBundle,
  GovernanceDashboard,
  HumanApproval,
  QualityGate,
  RoomWithOccupancy,
  ChatContact,
  ChatMessage,
  CreateBookingPayload,
  CreateHardwareRequestPayload,
  HardwareRequest,
  HardwareRequestStatus,
  HardwareRequestWithUser,
  JoinWaitlistPayload,
  LicenseBudgetReport,
  LicenseReport,
  LicenseRequest,
  LicenseRequestStatus,
  LicenseRequestWithUser,
  LikeStatus,
  MfaEnrollResult,
  MfaStatus,
  ProfileUpdatePayload,
  PublicProfile,
  ReviewBookingPayload,
  Room,
  ShowcaseComment,
  ShowcaseEngagement,
  ShowcaseItem,
  SimilarBooking,
  StageEvent,
  SubjectKind,
  SupportRequest,
  SupportRequestStatus,
  SupportRequestWithUser,
  UserLicenseUsage,
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

/**
 * Cache'lenmiş CSRF token'ı temizler. Login/Register sayfası mount olduğunda
 * çağrılır — backend restart veya session geçişi sonrası eski token'la
 * 403 alma riskini ortadan kaldırır (bir sonraki istek fresh fetch yapar).
 */
export function clearCsrfCache(): void {
  cachedCsrfToken = null;
  csrfFetching = null;
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

/**
 * Bildirim endpoint base path'i. user/admin doğrudan `/{kind}` altında route'lanır;
 * danışman ve ar-ge ise governance router'ında (`/governance/{kind}`) yaşar — token
 * audience'ları ayrı olduğu için user/admin route'larına düşemezler.
 */
function notificationBase(kind: SubjectKind): string {
  return kind === 'danisman' || kind === 'arge'
    ? `/governance/${kind}`
    : `/${kind}`;
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
    'appointment.changed',
    'chat.message',
    'hardware_request.created',
    'hardware_request.reviewed',
    'support_request.created',
  ];
  for (const n of eventNames) source.addEventListener(n, wrap(n));

  return { close: () => source.close(), source };
}

/**
 * Aktif personel oturumunun kind'ı. `/api/admin/*` endpoint'leri artık GET
 * isteklerinde danışman/arge token'ı da kabul ediyor (read-only). Tek-oturum
 * politikası gereği aynı anda yalnızca bir staff oturumu açıktır; bu yüzden
 * admin api metotları sabit 'admin' yerine aktif staff kind'ını kullanır.
 * Sıf admin → 'admin' (davranış değişmez); danışman/arge → kendi token'ı.
 */
function staffKind(): SubjectKind {
  if (sessionStore.get('admin')) return 'admin';
  if (sessionStore.get('danisman')) return 'danisman';
  if (sessionStore.get('arge')) return 'arge';
  return 'admin';
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
    // governanceRole REMOVED (C2) — backend reddediyor zaten, type'tan da kaldırıldı.
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

  /* ============ ŞİFRE SIFIRLAMA ============ */

  async forgotPassword(email: string) {
    return request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      kind: 'user',
      auth: false,
    });
  },

  async resetPassword(token: string, password: string, passwordConfirm: string) {
    return request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: { token, password, passwordConfirm },
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
      kind: staffKind(),
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
      await request('/auth/logout', { method: 'POST', kind: staffKind() });
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

  /* ============ APPOINTMENTS — günlük randevular ============ */

  async listUserAppointments(opts: {
    from?: string;
    to?: string;
    includeCancelled?: boolean;
  } = {}) {
    const qs = new URLSearchParams();
    if (opts.from) qs.set('from', opts.from);
    if (opts.to) qs.set('to', opts.to);
    if (opts.includeCancelled) qs.set('includeCancelled', 'true');
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ appointments: Appointment[] }>(
      `/user/appointments${query}`,
      { kind: 'user' }
    );
  },

  async listBookingAppointments(bookingId: string) {
    return request<{ appointments: Appointment[] }>(
      `/user/bookings/${encodeURIComponent(bookingId)}/appointments`,
      { kind: 'user' }
    );
  },

  async createAppointment(payload: {
    bookingId: string;
    startAt: string;
    endAt: string;
    title?: string;
    notes?: string;
  }) {
    return request<{ appointment: Appointment }>('/user/appointments', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async cancelAppointment(id: string) {
    return request<{ cancelled: boolean }>(
      `/user/appointments/${encodeURIComponent(id)}`,
      { method: 'DELETE', kind: 'user' }
    );
  },

  /** Kullanıcı admin'den proje aşamasının ilerletilmesini talep eder. */
  async requestStageAdvance(bookingId: string, note?: string) {
    return request<{ booking: Booking }>(
      `/user/bookings/${encodeURIComponent(bookingId)}/request-advance`,
      { method: 'POST', body: { note }, kind: 'user' }
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
    return request<{ bookings: Booking[] }>(`/admin/bookings${qs}`, { kind: staffKind() });
  },

  async reviewBooking(id: string, payload: ReviewBookingPayload) {
    return request<{
      booking: Booking;
      autoWaitlisted: boolean;
      waitlistPosition?: number;
    }>(`/admin/bookings/${id}/review`, {
      method: 'POST',
      body: payload,
      kind: staffKind(),
    });
  },

  async adminStats() {
    return request<{ stats: AdminStats }>('/admin/stats', { kind: staffKind() });
  },

  async adminAnalytics() {
    return request<AnalyticsResponse>('/admin/analytics', { kind: staffKind() });
  },

  async adminLicenses() {
    return request<LicenseReport>('/admin/licenses', { kind: staffKind() });
  },

  async adminLicenseBudget() {
    return request<LicenseBudgetReport>('/admin/licenses/budget', { kind: staffKind() });
  },

  async myLicenseUsage() {
    return request<UserLicenseUsage>('/user/me/licenses', { kind: 'user' });
  },

  async adminListWaitlist() {
    return request<{ entries: WaitlistEntry[] }>('/admin/waitlist', { kind: staffKind() });
  },

  /** Admin: waitlist sırası değiştirme (öncelik verme). */
  async adminMoveWaitlist(id: string, move: 'up' | 'down' | 'top') {
    return request<{ entries: WaitlistEntry[] }>(
      `/admin/waitlist/${encodeURIComponent(id)}/move`,
      { method: 'POST', body: { move }, kind: staffKind() }
    );
  },

  /* ============ ODALAR — admin doluluk + atama ============ */

  async adminRoomsOccupancy() {
    return request<{ rooms: RoomWithOccupancy[] }>('/admin/rooms/occupancy', {
      kind: staffKind(),
    });
  },

  async adminReassignBooking(bookingId: string, roomId: string) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/reassign`,
      { method: 'POST', body: { roomId }, kind: staffKind() }
    );
  },

  async adminReassignBookingUser(bookingId: string, userId: string) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/reassign-user`,
      { method: 'POST', body: { userId }, kind: staffKind() }
    );
  },

  async adminDeleteBooking(bookingId: string) {
    return request<{
      deleted: boolean;
      roomId: string;
      userId: string;
      wasApproved: boolean;
    }>(`/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: 'DELETE',
      kind: staffKind(),
    });
  },

  /** Booking detayı + yaşam döngüsü zaman çizelgesi (modal "Geçmiş" tab'ı için). */
  async adminGetBookingDetail(bookingId: string) {
    return request<{ booking: Booking; stageEvents: StageEvent[] }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}`,
      { kind: staffKind() }
    );
  },

  async adminAdvanceBookingStage(bookingId: string) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/advance-stage`,
      { method: 'POST', kind: staffKind() }
    );
  },

  async adminRegressBookingStage(bookingId: string) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/regress-stage`,
      { method: 'POST', kind: staffKind() }
    );
  },

  async adminSetBookingReviewTrack(bookingId: string, track: 'standard' | 'swat') {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/review-track`,
      { method: 'POST', body: { track }, kind: staffKind() }
    );
  },

  async adminRejectStageAdvanceRequest(bookingId: string, note?: string) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(bookingId)}/advance-request`,
      { method: 'DELETE', body: { note }, kind: staffKind() }
    );
  },

  /* ============ YÖNETIŞIM — DANIŞMAN ============ */

  async danismanInbox() {
    return request<{
      licenseRequests: LicenseRequestWithUser[];
      bookings: Booking[];
      counts: { licenseRequestsPending: number; bookingsPending: number };
    }>('/governance/danisman/inbox', { kind: 'danisman' });
  },

  async danismanReviewBooking(bookingId: string, payload: ReviewBookingPayload) {
    return request<{
      booking: Booking;
      autoWaitlisted: boolean;
      waitlistPosition?: number;
    }>(`/governance/danisman/bookings/${encodeURIComponent(bookingId)}/review`, {
      method: 'POST',
      body: payload,
      kind: 'danisman',
    });
  },

  async danismanReviewLicense(
    licenseId: string,
    payload: { action: 'approve' | 'reject' | 'request_feedback' | 'swat'; feedback?: string }
  ) {
    return request<{ request: LicenseRequest }>(
      `/governance/danisman/license-requests/${encodeURIComponent(licenseId)}/review`,
      { method: 'POST', body: payload, kind: 'danisman' }
    );
  },

  /* ============ YÖNETIŞIM — AR-GE ============ */

  async argeProjects() {
    return request<{
      projects: Booking[];
      counts: {
        total: number;
        withAdvanceRequest: number;
        inStage: number;
        inProduction: number;
      };
    }>('/governance/arge/projects', { kind: 'arge' });
  },

  async argeAdvanceStage(bookingId: string) {
    return request<{ booking: Booking }>(
      `/governance/arge/bookings/${encodeURIComponent(bookingId)}/advance-stage`,
      { method: 'POST', kind: 'arge' }
    );
  },

  async argeRegressStage(bookingId: string) {
    return request<{ booking: Booking }>(
      `/governance/arge/bookings/${encodeURIComponent(bookingId)}/regress-stage`,
      { method: 'POST', kind: 'arge' }
    );
  },

  async argeRejectAdvanceRequest(bookingId: string) {
    return request<{ booking: Booking }>(
      `/governance/arge/bookings/${encodeURIComponent(bookingId)}/advance-request`,
      { method: 'DELETE', kind: 'arge' }
    );
  },

  async adminListAppointments(opts: {
    from?: string;
    to?: string;
    includeCancelled?: boolean;
  } = {}) {
    const qs = new URLSearchParams();
    if (opts.from) qs.set('from', opts.from);
    if (opts.to) qs.set('to', opts.to);
    if (opts.includeCancelled) qs.set('includeCancelled', 'true');
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ appointments: Appointment[] }>(
      `/admin/appointments${query}`,
      { kind: staffKind() }
    );
  },

  async adminCancelAppointment(id: string) {
    return request<{ cancelled: boolean }>(
      `/admin/appointments/${encodeURIComponent(id)}`,
      { method: 'DELETE', kind: staffKind() }
    );
  },

  /* ============ PAROLA — admin ============ */

  async adminResetUserPassword(userId: string, password: string) {
    return request<{ message: string }>(
      `/admin/users/${encodeURIComponent(userId)}/reset-password`,
      { method: 'POST', body: { password }, kind: staffKind() }
    );
  },

  async adminChangePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>('/admin/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
      kind: staffKind(),
    });
  },

  async toggleAdminShowcase(id: string, payload: { visible?: boolean; highlight?: boolean }) {
    return request<{ booking: Booking }>(
      `/admin/bookings/${encodeURIComponent(id)}/showcase`,
      { method: 'PUT', body: payload, kind: staffKind() }
    );
  },

  /* ============ ADMIN MFA ============ */

  async mfaStatus() {
    return request<MfaStatus>('/admin/mfa/status', { kind: staffKind() });
  },

  async mfaEnroll() {
    return request<MfaEnrollResult>('/admin/mfa/enroll', { method: 'POST', kind: staffKind() });
  },

  async mfaVerify(code: string) {
    return request<{ verified: boolean; usedBackupCode: boolean }>('/admin/mfa/verify', {
      method: 'POST',
      body: { code },
      kind: staffKind(),
    });
  },

  async mfaDisable(code: string) {
    return request<{ disabled: boolean }>('/admin/mfa/disable', {
      method: 'POST',
      body: { code },
      kind: staffKind(),
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
    return request<{ users: UserListItem[] }>(`/admin/users${query}`, { kind: staffKind() });
  },

  async adminListDepartments() {
    return request<{ departments: string[] }>('/admin/users/meta/departments', {
      kind: staffKind(),
    });
  },

  async adminGetUser(id: string) {
    return request<{ user: UserProfile }>(`/admin/users/${encodeURIComponent(id)}`, {
      kind: staffKind(),
    });
  },

  async adminUpdateUser(id: string, payload: AdminUserUpdatePayload) {
    return request<{ user: UserProfile }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
      kind: staffKind(),
    });
  },

  async adminDeleteUser(id: string) {
    return request<{ deleted: boolean }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      kind: staffKind(),
    });
  },

  async adminRestoreUser(id: string) {
    return request<{ user: UserProfile }>(
      `/admin/users/${encodeURIComponent(id)}/restore`,
      { method: 'POST', kind: staffKind() }
    );
  },

  /* ============ PROFİL FOTOĞRAFI ============ */

  async setMyPhoto(dataUrl: string) {
    return request<{ ok: boolean }>('/user/me/photo', {
      method: 'PUT',
      body: { dataUrl },
      kind: 'user',
    });
  },

  async clearMyPhoto() {
    return request<{ ok: boolean }>('/user/me/photo', {
      method: 'DELETE',
      kind: 'user',
    });
  },

  /* ============ GENEL SOHBET (rol-bağımsız chat) ============ */

  async chatContacts(kind: SubjectKind) {
    return request<{ contacts: ChatContact[] }>('/chat/contacts', { kind });
  },

  async chatConversation(kind: SubjectKind, peerId: string) {
    return request<{ messages: ChatMessage[]; markedRead: number }>(
      `/chat/conversations/${encodeURIComponent(peerId)}`,
      { kind }
    );
  },

  async chatSend(
    kind: SubjectKind,
    recipientId: string,
    recipientKind: 'user' | 'admin',
    body: string
  ) {
    return request<{ message: ChatMessage }>('/chat/messages', {
      method: 'POST',
      body: { recipientId, recipientKind, body },
      kind,
    });
  },

  async chatMarkRead(kind: SubjectKind, peerId: string) {
    return request<{ markedRead: number }>(
      `/chat/conversations/${encodeURIComponent(peerId)}/read`,
      { method: 'POST', kind }
    );
  },

  async chatUnread(kind: SubjectKind) {
    return request<{ unread: number }>('/chat/unread', { kind });
  },

  /* ============ BİLDİRİM MERKEZİ ============ */

  async listNotifications(kind: SubjectKind) {
    return request<{ items: AppNotification[]; unread: number }>(
      `${notificationBase(kind)}/notifications`,
      { kind }
    );
  },

  async markNotificationRead(kind: SubjectKind, id: string) {
    return request<void>(
      `${notificationBase(kind)}/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST', kind }
    );
  },

  async markAllNotificationsRead(kind: SubjectKind) {
    return request<{ marked: number }>(
      `${notificationBase(kind)}/notifications/read-all`,
      { method: 'POST', kind }
    );
  },

  /* ============ SHOWCASE LIKES & COMMENTS ============ */

  async getLikeStatus(bookingId: string) {
    return request<LikeStatus>(`/user/showcase/${encodeURIComponent(bookingId)}/likes`, {
      kind: 'user',
    });
  },

  async toggleLike(bookingId: string) {
    return request<LikeStatus>(`/user/showcase/${encodeURIComponent(bookingId)}/like`, {
      method: 'POST',
      kind: 'user',
    });
  },

  async listComments(bookingId: string) {
    return request<{ comments: ShowcaseComment[] }>(
      `/user/showcase/${encodeURIComponent(bookingId)}/comments`,
      { kind: 'user' }
    );
  },

  async postComment(bookingId: string, body: string) {
    return request<{ comment: ShowcaseComment }>(
      `/user/showcase/${encodeURIComponent(bookingId)}/comments`,
      { method: 'POST', body: { body }, kind: 'user' }
    );
  },

  async deleteComment(commentId: string) {
    return request<{ deleted: boolean }>(
      `/user/showcase/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE', kind: 'user' }
    );
  },

  async showcaseEngagement() {
    return request<{ engagement: ShowcaseEngagement }>('/public/showcase/engagement', {
      kind: 'user',
      auth: false,
      noAuth: true,
    });
  },

  /* ============ PUBLIC PROFİL ============ */

  async getPublicProfile(userId: string) {
    return request<{ profile: PublicProfile }>(
      `/public/users/${encodeURIComponent(userId)}`,
      { kind: 'user', auth: false, noAuth: true }
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
      kind: staffKind(),
    });
  },

  /* ============ LİSANS TALEPLERİ ============ */

  async licenseCatalog() {
    return request<{
      items: Array<{
        key: string;
        name: string;
        vendor: string;
        category: string;
        tier: 'paid' | 'free' | 'enterprise';
        monthlyUsd: number;
      }>;
    }>('/user/licenses/catalog', { kind: 'user' });
  },

  async listMyLicenseRequests() {
    return request<{ items: LicenseRequest[] }>('/user/licenses/requests', { kind: 'user' });
  },

  async createLicenseRequest(payload: LicenseRequestPayload) {
    return request<{ request: LicenseRequest }>('/user/licenses/requests', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async updateLicenseRequest(requestId: string, payload: LicenseRequestPayload) {
    return request<{ request: LicenseRequest }>(
      `/user/licenses/requests/${encodeURIComponent(requestId)}`,
      { method: 'PUT', body: payload, kind: 'user' }
    );
  },

  /** Kullanıcının kendi başvuru/proje detayı — yönetişim demeti dahil. */
  async userLicenseRequestDetail(requestId: string) {
    return request<GovernanceBundle>(
      `/user/licenses/requests/${encodeURIComponent(requestId)}`,
      { kind: 'user' }
    );
  },

  async adminListLicenseRequests(statusFilter?: LicenseRequestStatus) {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    return request<{ items: LicenseRequestWithUser[] }>(
      `/admin/licenses/requests${qs}`,
      { kind: staffKind() }
    );
  },

  async adminReviewLicenseRequest(
    requestId: string,
    payload: {
      action: 'approve' | 'reject' | 'request_feedback' | 'swat';
      adminFeedback?: string | null;
    }
  ) {
    return request<{ request: LicenseRequestWithUser }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/review`,
      { method: 'POST', body: payload, kind: staffKind() }
    );
  },

  /* ============ YÖNETİŞİM ============ */

  async adminLicenseRequestDetail(requestId: string) {
    return request<GovernanceBundle>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}`,
      { kind: staffKind() }
    );
  },

  async adminGovernanceDashboard() {
    return request<GovernanceDashboard>('/admin/licenses/governance/dashboard', {
      kind: staffKind(),
    });
  },

  async adminGovernanceAdmins() {
    return request<{ admins: GovernanceAdmin[] }>('/admin/governance/admins', {
      kind: staffKind(),
    });
  },

  async adminAdvanceLifecycle(requestId: string, note?: string | null) {
    return request<{ request: LicenseRequestWithUser; transition: { fromStage: string; toStage: string } }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/advance`,
      { method: 'POST', body: { note: note ?? null }, kind: staffKind() }
    );
  },

  async adminAssignEngineer(requestId: string, engineerId: string) {
    return request<{ request: LicenseRequestWithUser }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/assign-engineer`,
      { method: 'POST', body: { engineerId }, kind: staffKind() }
    );
  },

  async adminUpgradeProjectType(requestId: string) {
    return request<{ request: LicenseRequestWithUser }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/upgrade-type`,
      { method: 'POST', kind: staffKind() }
    );
  },

  async adminSetGateResult(
    requestId: string,
    payload: {
      gateKey: GateKey;
      status: GateStatus;
      score?: number | null;
      detail?: string | null;
    }
  ) {
    return request<{ gate: QualityGate }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/gates`,
      { method: 'PUT', body: payload, kind: staffKind() }
    );
  },

  async adminDecideApproval(
    requestId: string,
    payload: {
      approvalType: ApprovalType;
      decision: 'approved' | 'rejected';
      releaseNote?: string | null;
      riskAssessment?: string | null;
    }
  ) {
    return request<{ request: LicenseRequestWithUser; approval: HumanApproval }>(
      `/admin/licenses/requests/${encodeURIComponent(requestId)}/approval`,
      { method: 'POST', body: payload, kind: staffKind() }
    );
  },

  /* ============ DONANIM TALEPLERİ ============ */

  async listMyHardwareRequests() {
    return request<{ items: HardwareRequest[] }>('/user/hardware/requests', {
      kind: 'user',
    });
  },

  async createHardwareRequest(payload: CreateHardwareRequestPayload) {
    return request<{ request: HardwareRequest }>('/user/hardware/requests', {
      method: 'POST',
      body: payload,
      kind: 'user',
    });
  },

  async updateHardwareRequest(id: string, payload: CreateHardwareRequestPayload) {
    return request<{ request: HardwareRequest }>(
      `/user/hardware/requests/${encodeURIComponent(id)}`,
      { method: 'PUT', body: payload, kind: 'user' }
    );
  },

  async adminListHardwareRequests(statusFilter?: HardwareRequestStatus) {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    return request<{ items: HardwareRequestWithUser[] }>(
      `/admin/hardware/requests${qs}`,
      { kind: staffKind() }
    );
  },

  async adminReviewHardwareRequest(
    id: string,
    payload: {
      action: 'approve' | 'reject' | 'request_feedback';
      adminFeedback?: string | null;
    }
  ) {
    return request<{ request: HardwareRequestWithUser }>(
      `/admin/hardware/requests/${encodeURIComponent(id)}/review`,
      { method: 'POST', body: payload, kind: staffKind() }
    );
  },

  /* ============ DESTEK TALEPLERİ ============ */

  async createSupportRequest(description: string) {
    return request<{ request: SupportRequest }>('/user/support/requests', {
      method: 'POST',
      body: { description },
      kind: 'user',
    });
  },

  async adminListSupportRequests(statusFilter?: SupportRequestStatus) {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    return request<{ items: SupportRequestWithUser[] }>(
      `/admin/support/requests${qs}`,
      { kind: staffKind() }
    );
  },

  async adminResolveSupportRequest(id: string) {
    return request<{ request: SupportRequestWithUser }>(
      `/admin/support/requests/${encodeURIComponent(id)}/resolve`,
      { method: 'POST', kind: staffKind() }
    );
  },
};

/** createLicenseRequest / updateLicenseRequest ortak gövdesi. */
export interface LicenseRequestPayload {
  requestTitle: string;
  reason: string;
  expectedBenefit: string;
  successCriteria: string;
  items: Array<{
    licenseKey: string;
    licenseName: string;
    vendor?: string | null;
    category?: string | null;
  }>;
  projectType: 'poc' | 'integration';
  estimatedDurationDays?: number | null;
  dataToUse: string;
  technicalStack?: string | null;
  durationMonths: 1 | 3 | 6 | 12;
  usesExternalApi: boolean;
  involvesRealData: boolean;
}
