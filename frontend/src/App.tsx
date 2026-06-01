import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import UserRooms from './pages/UserRooms';
import UserBookings from './pages/UserBookings';
import UserCalendar from './pages/UserCalendar';
import UserFAQ from './pages/UserFAQ';
import UserLicenses from './pages/UserLicenses';
import UserWaitlist from './pages/UserWaitlist';
import Chat from './pages/Chat';
import VisualGenerator from './pages/VisualGenerator';
import Showcase from './pages/Showcase';
import PrivacySettings from './pages/PrivacySettings';
import PublicProfile from './pages/PublicProfile';
import AdminDashboard from './pages/AdminDashboard';
import AdminRooms from './pages/AdminRooms';
import AdminUsers from './pages/AdminUsers';
import AdminAnalytics from './pages/AdminAnalytics';
import AdminCalendar from './pages/AdminCalendar';
import AdminWaitlist from './pages/AdminWaitlist';
import AdminSecurity from './pages/AdminSecurity';
import AdminAuditLog from './pages/AdminAuditLog';
import AdminLicenses from './pages/AdminLicenses';
import AdminProjects from './pages/AdminProjects';
import AdminHardwareRequests from './pages/AdminHardwareRequests';
import AdminSupportRequests from './pages/AdminSupportRequests';
import ArgeDashboard from './pages/ArgeDashboard';
import DanismanDashboard from './pages/DanismanDashboard';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/showcase" element={<Showcase />} />
            <Route path="/u/:userId" element={<PublicProfile />} />
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
              path="/takvim"
              element={
                <ProtectedRoute kind="user">
                  <UserCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/licenses"
              element={
                <ProtectedRoute kind="user">
                  <UserLicenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/yardim"
              element={
                <ProtectedRoute kind="user">
                  <UserFAQ />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gorsel"
              element={
                <ProtectedRoute kind="user">
                  <VisualGenerator />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sohbet"
              element={
                <ProtectedRoute kind="any">
                  <Chat />
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
                <ProtectedRoute kind={['admin', 'danisman', 'arge']}>
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
                <ProtectedRoute kind={['admin', 'danisman', 'arge']}>
                  <AdminCalendar />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/rooms"
              element={
                <ProtectedRoute kind={['admin', 'danisman', 'arge']}>
                  <AdminRooms />
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
            <Route
              path="/admin/licenses"
              element={
                <ProtectedRoute kind={['admin', 'danisman', 'arge']}>
                  <AdminLicenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/projects"
              element={
                <ProtectedRoute kind={['admin', 'danisman', 'arge']}>
                  <AdminProjects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/hardware"
              element={
                <ProtectedRoute kind="admin">
                  <AdminHardwareRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/support"
              element={
                <ProtectedRoute kind="admin">
                  <AdminSupportRequests />
                </ProtectedRoute>
              }
            />

            {/* Yönetişim rolü dashboard'ları — her biri kendi kind'ında */}
            <Route
              path="/danisman"
              element={
                <ProtectedRoute kind="danisman">
                  <DanismanDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/arge"
              element={
                <ProtectedRoute kind="arge">
                  <ArgeDashboard />
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
