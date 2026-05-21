import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { SubjectKind } from '../types';

interface ProtectedRouteProps {
  kind: SubjectKind;
  children: ReactNode;
}

export function ProtectedRoute({ kind, children }: ProtectedRouteProps) {
  const auth = useAuth();
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-kt-gray-50">
        <div className="text-kt-gray-500">Yükleniyor...</div>
      </div>
    );
  }
  const me =
    kind === 'admin'
      ? auth.admin
      : kind === 'danisman'
        ? auth.danisman
        : kind === 'arge'
          ? auth.arge
          : auth.user;
  if (!me) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
