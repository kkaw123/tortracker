import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import BossDashboard from './pages/BossDashboard';
import OutletDashboard from './pages/OutletDashboard';
import StockList from './pages/Stock/StockList';
import DailyAdjustment from './pages/Adjustments/DailyAdjustment';
import TransferList from './pages/Transfers/TransferList';
import ComplaintList from './pages/Complaints/ComplaintList';
import ComplaintReview from './pages/Complaints/ComplaintReview';
import Alerts from './pages/Alerts/Alerts';
import Reports from './pages/Reports/Reports';
import POList from './pages/PurchaseOrders/POList';
import LoadingSpinner from './components/Common/LoadingSpinner';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'boss') return <Navigate to="/dashboard" replace />;
  return <Navigate to={`/outlet/${user.outlet_code?.toLowerCase()}`} replace />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<BossDashboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/complaints/review" element={<ComplaintReview />} />
            <Route path="/outlet/:outletId" element={<OutletDashboard />} />
            <Route path="/outlet/:outletId/stock" element={<StockList />} />
            <Route path="/outlet/:outletId/adjustments" element={<DailyAdjustment />} />
            <Route path="/outlet/:outletId/transfers" element={<TransferList />} />
            <Route path="/outlet/:outletId/complaints" element={<ComplaintList />} />
            <Route path="/outlet/:outletId/reports" element={<Reports />} />
            <Route path="/outlet/:outletId/purchase-orders" element={<POList />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
