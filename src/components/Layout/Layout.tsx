import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview Dashboard',
  '/alerts': 'Alerts',
  '/reports': 'All Reports',
  '/complaints/review': 'Complaint Review',
};

function getTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.includes('/stock')) return 'Stock Inventory';
  if (pathname.includes('/adjustments')) return 'Daily Adjustment';
  if (pathname.includes('/transfers')) return 'Transfers';
  if (pathname.includes('/complaints')) return 'Quality Complaints';
  if (pathname.includes('/purchase-orders')) return 'Purchase Orders';
  if (pathname.includes('/reports')) return 'Reports';
  if (pathname.includes('/outlet')) return 'Outlet Dashboard';
  return 'TorTracker';
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    fetchAlertCount();
    const channel = supabase
      .channel('alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, () => {
        fetchAlertCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function fetchAlertCount() {
    if (!user) return;
    let query = supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('is_read', false);
    if (user.role !== 'boss' && user.role !== 'joey' && user.outlet_code !== 'PLT') {
      query = query.eq('outlet_id', user.outlet_id!);
    }
    const { count } = await query;
    setAlertCount(count ?? 0);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative inset-y-0 left-0 z-40 w-64 flex-shrink-0 transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} alertCount={alertCount} />
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          title={getTitle(location.pathname)}
          onMenuClick={() => setSidebarOpen(true)}
          alertCount={alertCount}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
