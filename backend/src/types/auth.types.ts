/**
 * Auth type definitions.
 */
export type SubjectKind = 'user' | 'admin';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'user';
  department: string | null;
  title: string | null;
  manager: string | null;
  phone: string | null;
  bio: string | null;
  project_idea: string | null;
  failed_login_count: number;
  locked_until: string | null;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface AdminRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'super_admin';
  failed_login_count: number;
  locked_until: string | null;
  status: number;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  sub: string;
  type: SubjectKind;
  role: string;
  email: string;
}

export interface AuthContext {
  subjectId: string;
  subjectType: SubjectKind;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
