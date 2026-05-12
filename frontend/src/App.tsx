import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import UserRooms from './pages/UserRooms';
import UserBookings from './pages/UserBookings';
import UserWaitlist from './pages/UserWaitlist';
import Showcase from './pages/Showcase';
import PrivacySettings from './pages/PrivacySettings';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminCalendar from './pages/AdminCalendar';
import AdminWaitlist from './pages/AdminWaitlist';
import AdminSecurity from './pages/AdminSecurity';
import AdminAuditLog from './pages/AdminAuditLog';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/showcase" element={<Showcase />} />
            {/* Eski URL'ler /login'e yönlendirilir — backwards compat */}
            <Route path="/admin/login" element={<Navigate to="/login" replace />} />

            <Route
              path="/rooms"
              element={
                <ProtectedRoute kind="user">
                  <UserRooms />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookings"
              element={
                <ProtectedRoute kind="user">
                  <UserBookings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute kind="user">
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/waitlist"
              element={
                <ProtectedRoute kind="user">
                  <UserWaitlist />
                </ProtectedRoute>
              }
            />
            <Route
              path="/privacy"
              element={
                <ProtectedRoute kind="user">
                  <PrivacySettings />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute kind="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute kind="admin">
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <ProtectedRoute kind="admin">
                  <AdminAnalytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/calendar"
              element={
                <ProtectedRoute kind="admin">
                  <AdminCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/waitlist"
              element={
                <ProtectedRoute kind="admin">
                  <AdminWaitlist />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/security"
              element={
                <ProtectedRoute kind="admin">
                  <AdminSecurity />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <ProtectedRoute kind="admin">
                  <AdminAuditLog />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
