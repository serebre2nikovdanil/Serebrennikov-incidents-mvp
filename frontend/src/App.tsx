import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from '@/shared/auth';
import { AppLayout } from '@/shared/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { IncidentsPage } from '@/features/incidents/IncidentsPage';
import { IncidentCardPage } from '@/features/incidents/IncidentCardPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CatalogsPage } from '@/features/catalogs/CatalogsPage';
import { UsersPage } from '@/features/users/UsersPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { MyTemplatesPage } from '@/features/templates/MyTemplatesPage';
import { UserRole } from '@/api/types';

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: UserRole[] }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin tip="Загрузка" style={{ width: '100%', padding: 80 }} />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/incidents" replace />;
  return children;
}

function Routing() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/incidents" replace />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/incidents/:id" element={<IncidentCardPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth roles={['supervisor', 'administrator']}>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-templates"
          element={
            <RequireAuth roles={['manager', 'administrator']}>
              <MyTemplatesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/catalogs"
          element={
            <RequireAuth roles={['administrator']}>
              <CatalogsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth roles={['administrator']}>
              <UsersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireAuth roles={['administrator']}>
              <AuditPage />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routing />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
