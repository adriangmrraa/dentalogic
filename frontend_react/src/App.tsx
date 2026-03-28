import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import DashboardView from './views/DashboardView';
import AgendaView from './views/AgendaView';
import PatientsView from './views/PatientsView';
import PatientDetail from './views/PatientDetail';
import ProfessionalAnalyticsView from './views/ProfessionalAnalyticsView';
import ChatsView from './views/ChatsView';
import TreatmentsView from './views/TreatmentsView';
import LoginView from './views/LoginView';
import LandingView from './views/LandingView';
import UserApprovalView from './views/UserApprovalView';
import ProfileView from './views/ProfileView';
import ClinicsView from './views/ClinicsView';
import ConfigView from './views/ConfigView';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';

// Lazy-loaded views (Fase 3-6)
const AnamnesisPublicView = lazy(() => import('./views/AnamnesisPublicView'));
const PrivacyTermsView = lazy(() => import('./views/PrivacyTermsView'));
const DashboardStatusView = lazy(() => import('./views/DashboardStatusView'));
const MarketingHubView = lazy(() => import('./views/MarketingHubView'));
const LeadsManagementView = lazy(() => import('./views/LeadsManagementView'));
const LeadDetailView = lazy(() => import('./views/LeadDetailView'));
const MetaTemplatesView = lazy(() => import('./views/MetaTemplatesView'));

const LazyFallback = () => (
  <div className="h-full flex items-center justify-center">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

function App() {
  return (
    <Router>
      <AuthProvider>
        <LanguageProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginView />} />
          <Route path="/demo" element={<LandingView />} />
          <Route path="/privacy" element={
            <Suspense fallback={<LazyFallback />}><PrivacyTermsView /></Suspense>
          } />
          <Route path="/terms" element={
            <Suspense fallback={<LazyFallback />}><PrivacyTermsView /></Suspense>
          } />
          <Route path="/anamnesis/:tenantId/:token" element={
            <Suspense fallback={<LazyFallback />}><AnamnesisPublicView /></Suspense>
          } />

          {/* Protected Routes */}
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Suspense fallback={<LazyFallback />}>
                <Routes>
                  <Route index element={<DashboardView />} />
                  <Route path="agenda" element={<AgendaView />} />
                  <Route path="pacientes" element={<PatientsView />} />
                  <Route path="pacientes/:id" element={<PatientDetail />} />
                  <Route path="chats" element={<ChatsView />} />
                  <Route path="tratamientos" element={<TreatmentsView />} />
                  <Route path="perfil" element={<ProfileView />} />
                  <Route path="profesionales" element={<Navigate to="/aprobaciones" replace />} />

                  {/* CEO Only Routes */}
                  <Route path="dashboard/status" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <DashboardStatusView />
                    </ProtectedRoute>
                  } />
                  <Route path="analytics/professionals" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <ProfessionalAnalyticsView />
                    </ProtectedRoute>
                  } />
                  <Route path="aprobaciones" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <UserApprovalView />
                    </ProtectedRoute>
                  } />
                  <Route path="sedes" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <ClinicsView />
                    </ProtectedRoute>
                  } />
                  <Route path="configuracion" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <ConfigView />
                    </ProtectedRoute>
                  } />
                  <Route path="marketing" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <MarketingHubView />
                    </ProtectedRoute>
                  } />
                  <Route path="leads" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <LeadsManagementView />
                    </ProtectedRoute>
                  } />
                  <Route path="leads/:id" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <LeadDetailView />
                    </ProtectedRoute>
                  } />
                  <Route path="templates" element={
                    <ProtectedRoute allowedRoles={['ceo']}>
                      <MetaTemplatesView />
                    </ProtectedRoute>
                  } />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
        </LanguageProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
