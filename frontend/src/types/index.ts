export type SubjectKind = 'user' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: 'user';
  department: string | null;
  title: string | null;
  manager: string | null;
  phone: string | null;
  bio: string | null;
  projectIdea: string | null;
  profilePhoto: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserListItem extends UserProfile {
  bookingCount: number;
  approvedBookingCount: number;
  pendingBookingCount: number;
  lastBookingAt: string | null;
}

export interface ProfileUpdatePayload {
  fullName?: string;
  department?: string;
  title?: string;
  manager?: string;
  phone?: string;
  bio?: string;
  projectIdea?: string;
}

export interface AdminUserUpdatePayload extends ProfileUpdatePayload {
  status?: 1 | 3;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type RoomTheme = 'robot' | 'pc' | 'neural' | 'chatbot' | 'data' | 'brain' | 'code' | 'cloud' | 'vector' | 'agent';

export interface Room {
  id: string;
  code: string;
  name: string;
  district: string;
  neighborhood: string;
  capacity: number;
  description: string | null;
  theme: RoomTheme;
  isAvailable: boolean;
  nextAvailableDate: string | null;
}

export type BookingStatus = 'pending' | 'approved' | 'rejected' | 'feedback_requested';

export interface Booking {
  id: string;
  userId: string;
  userEmail?: string;
  userFullName?: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  periodMonths: number;
  startDate: string;
  endDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
  status: BookingStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  feedback_requested: number;
}

export interface CreateBookingPayload {
  roomId: string;
  periodMonths: 1 | 2 | 3;
  startDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
}

export interface ReviewBookingPayload {
  action: 'approve' | 'reject' | 'request_feedback';
  feedback?: string;
}

export interface ApiError {
  error: string;
  code?: string;
  issues?: Array<{ path: string; message: string }>;
}

/* ============================================================
 * WAITLIST
 * ============================================================ */

export type WaitlistStatus = 'waiting' | 'promoted' | 'expired' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  userId: string;
  userFullName?: string;
  userEmail?: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  periodMonths: number;
  desiredStartDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
  position: number;
  status: WaitlistStatus;
  promotedBookingId: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JoinWaitlistPayload {
  roomId: string;
  periodMonths: 1 | 2 | 3;
  desiredStartDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
}

/* ============================================================
 * ANALYTICS
 * ============================================================ */

export interface DailyBookingPoint {
  date: string;
  created: number;
  approved: number;
  rejected: number;
}

export interface RoomUsage {
  roomId: string;
  roomCode: string;
  roomName: string;
  totalBookings: number;
  approvedBookings: number;
  utilizationDays: number;
}

export interface TechnologyCount {
  technology: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface PeriodDistribution {
  periodMonths: number;
  count: number;
}

export interface TopUser {
  userId: string;
  fullName: string;
  email: string;
  bookingCount: number;
  approvedCount: number;
}

export interface AnalyticsResponse {
  generatedAt: string;
  dailyBookings: DailyBookingPoint[];
  roomUsage: RoomUsage[];
  topTechnologies: TechnologyCount[];
  statusBreakdown: StatusBreakdown[];
  periodDistribution: PeriodDistribution[];
  topUsers: TopUser[];
  totals: {
    bookings: number;
    users: number;
    approved: number;
    pending: number;
    rejected: number;
    feedbackRequested: number;
    activeWaitlist: number;
  };
}

/* ============================================================
 * ADMIN USER SEARCH
 * ============================================================ */

export interface AdminUserSearchFilters {
  q?: string;
  status?: 'all' | 'active' | 'disabled';
  department?: string;
  hasBookings?: 'any' | 'yes' | 'no';
}

/* ============================================================
 * MFA
 * ============================================================ */

export interface MfaStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

/* ============================================================
 * SHOWCASE
 * ============================================================ */

export interface ShowcaseItem {
  id: string;
  projectName: string;
  projectDescription: string;
  technologies: string[];
  roomCode: string;
  roomName: string;
  district: string;
  neighborhood: string;
  theme: string;
  authorId: string;
  authorFullName: string;
  periodMonths: number;
  startDate: string;
  endDate: string;
  isHighlight: boolean;
  approvedAt: string | null;
}

/* ============================================================
 * SEMANTIC SEARCH
 * ============================================================ */

/* ============================================================
 * LİSANSLAR
 * ============================================================ */

export type LicenseTier = 'paid' | 'free' | 'enterprise';
export type LicenseCategory =
  | 'AI Assistant'
  | 'IDE'
  | 'Cloud'
  | 'API'
  | 'Framework'
  | 'Database';

export interface UserLicenseEntry {
  technology: string;
  name: string;
  category: LicenseCategory;
  monthlyUsd: number;
  tier: LicenseTier;
  vendor: string;
  bookingCount: number;
}

export interface UserLicenseUsage {
  userId: string;
  userFullName: string;
  userEmail: string;
  department: string | null;
  licenses: UserLicenseEntry[];
  totalMonthlyUsd: number;
  activeBookingCount: number;
}

export interface LicenseSummary {
  technology: string;
  name: string;
  category: LicenseCategory;
  tier: LicenseTier;
  monthlyUsd: number;
  vendor: string;
  userCount: number;
  bookingCount: number;
  totalMonthlyUsd: number;
  users: Array<{ id: string; fullName: string; email: string }>;
}

export interface LicenseReport {
  generatedAt: string;
  byUser: UserLicenseUsage[];
  bySoftware: LicenseSummary[];
  totals: {
    totalUsers: number;
    paidLicenseUsers: number;
    totalMonthlyUsd: number;
    totalAnnualUsd: number;
    distinctLicensesUsed: number;
    paidLicenseCount: number;
    freeLicenseCount: number;
  };
}

export interface SimilarBooking {
  bookingId: string;
  similarity: number;
  projectName: string;
  projectDescription: string;
  technologies: string[];
  status: string;
  roomCode: string;
  roomName: string;
  userFullName: string;
  isOwn?: boolean;
  anonymized?: boolean;
  createdAt: string;
}

/* ============================================================
 * MESAJLAŞMA
 * ============================================================ */

export interface BookingMessage {
  id: string;
  bookingId: string;
  authorId: string;
  authorType: 'user' | 'admin';
  authorName: string;
  body: string;
  readByRecipient: boolean;
  createdAt: string;
}

export interface ThreadMeta {
  total: number;
  unread: number;
}

/* ============================================================
 * SHOWCASE ETKİLEŞİM
 * ============================================================ */

export interface LikeStatus {
  liked: boolean;
  count: number;
}

export interface ShowcaseComment {
  id: string;
  bookingId: string;
  userId: string;
  userFullName: string;
  userProfilePhoto: string | null;
  body: string;
  createdAt: string;
}

export type ShowcaseEngagement = Record<string, { likes: number; comments: number }>;

/* ============================================================
 * PUBLIC PROFİL
 * ============================================================ */

export interface PublicProfile {
  id: string;
  fullName: string;
  department: string | null;
  title: string | null;
  bio: string | null;
  projectIdea: string | null;
  profilePhoto: string | null;
  joinedAt: string;
  projects: Array<{
    id: string;
    projectName: string;
    projectDescription: string;
    technologies: string[];
    roomCode: string;
    roomName: string;
    startDate: string;
    endDate: string;
    isHighlight: boolean;
    likeCount: number;
    commentCount: number;
    approvedAt: string | null;
  }>;
  stats: {
    projectCount: number;
    totalLikes: number;
    totalComments: number;
  };
}


/* ============================================================
 * LİSANS TALEPLERİ — request/approval iş akışı
 * (license analytics LicenseReport'tan AYRI — bu user'ın admin'den
 *  istediği lisans için)
 * ============================================================ */

export type LicenseRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'feedback_requested';

export interface LicenseRequest {
  id: string;
  userId: string;
  licenseKey: string;
  licenseName: string;
  vendor: string | null;
  category: string | null;
  reason: string;
  durationMonths: 1 | 3 | 6 | 12;
  status: LicenseRequestStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseRequestWithUser extends LicenseRequest {
  userFullName: string;
  userEmail: string;
  userDepartment: string | null;
  reviewerName: string | null;
}
