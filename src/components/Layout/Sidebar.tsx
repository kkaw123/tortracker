import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ArrowLeftRight, ClipboardList,
  FileText, Bell, ShoppingCart, LogOut, ChevronDown, ChevronRight,
  AlertTriangle, BarChart3, Building2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { OUTLETS } from '../../lib/utils';
import { useState } from 'react';

interface SidebarProps {
  onClose?: () => void;
  alertCount: number;
}

export default function Sidebar({ onClose, alertCount }: SidebarProps) {
  const { user, logout, isBoss, isHQ } = useAuth();
  const navigate = useNavigate();
  const [outletOpen, setOutletOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const outletNav = (code: string, name: string) => {
    const slug = code.toLowerCase();
    return (
      <NavLink
        key={code}
        to={`/outlet/${slug}`}
        onClick={onClose}
        className={({ isActive }) =>
          `flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
            isActive ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-700'
          }`
        }
      >
        <Building2 size={14} />
        {name}
      </NavLink>
    );
  };

  const navItem = (to: string, icon: React.ReactNode, label: string, badge?: number) => (
    <NavLink
      to={to}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
          isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
        }`
      }
    >
      {icon}
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </NavLink>
  );

  const myOutlet = user?.outlet_code?.toLowerCase();

  return (
    <div className="flex flex-col h-full bg-slate-800 text-white">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">TT</div>
          <div>
            <div className="font-bold text-white text-sm">TorTracker</div>
            <div className="text-xs text-slate-400">Optical Inventory</div>
          </div>
        </div>
        {user && (
          <div className="mt-3 px-2 py-1.5 bg-slate-700 rounded-lg">
            <div className="text-xs text-slate-400">Logged in as</div>
            <div className="text-sm font-semibold text-white">{user.name}</div>
            <div className="text-xs text-blue-400 capitalize">{user.role} · {user.outlet_code ?? 'All Outlets'}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {/* Boss gets overview dashboard */}
        {isBoss() && navItem('/dashboard', <LayoutDashboard size={16} />, 'Overview Dashboard')}

        {/* Alerts - everyone */}
        {navItem('/alerts', <Bell size={16} />, 'Alerts', alertCount)}

        <div className="pt-2 pb-1 px-2 text-xs text-slate-500 uppercase tracking-wider font-semibold">
          Outlets
        </div>

        {/* Boss & HQ: collapsible outlet list */}
        {(isBoss() || isHQ()) ? (
          <>
            <button
              onClick={() => setOutletOpen(!outletOpen)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Building2 size={16} />
              <span className="flex-1 text-sm font-medium text-left">All Outlets</span>
              {outletOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {outletOpen && (
              <div className="pl-3 space-y-1">
                {OUTLETS.map((o) => outletNav(o.code, o.name))}
              </div>
            )}
          </>
        ) : (
          myOutlet && outletNav(user!.outlet_code!, user!.outlet_code === 'PLT' ? 'PLT HQ' : `${user!.outlet_code} Outlet`)
        )}

        {/* My outlet quick links */}
        {myOutlet && (
          <>
            <div className="pt-2 pb-1 px-2 text-xs text-slate-500 uppercase tracking-wider font-semibold">
              {user?.outlet_code === 'PLT' ? 'HQ Operations' : 'My Outlet'}
            </div>
            {navItem(`/outlet/${myOutlet}/stock`, <Package size={16} />, 'Stock Inventory')}
            {navItem(`/outlet/${myOutlet}/adjustments`, <ClipboardList size={16} />, 'Daily Adjustment')}
            {navItem(`/outlet/${myOutlet}/transfers`, <ArrowLeftRight size={16} />, user?.outlet_code === 'PLT' ? 'Supply' : 'Transfers')}
            {navItem(`/outlet/${myOutlet}/complaints`, <AlertTriangle size={16} />, 'Quality Complaints')}
            {navItem(`/outlet/${myOutlet}/purchase-orders`, <ShoppingCart size={16} />, user?.outlet_code === 'PLT' ? 'Purchase Orders' : 'PO History')}
            {navItem(`/outlet/${myOutlet}/reports`, <BarChart3 size={16} />, 'Reports')}
          </>
        )}

        {/* Boss gets all report link */}
        {isBoss() && (
          <>
            <div className="pt-2 pb-1 px-2 text-xs text-slate-500 uppercase tracking-wider font-semibold">
              Management
            </div>
            {navItem('/reports', <FileText size={16} />, 'All Reports')}
            {navItem('/complaints/review', <AlertTriangle size={16} />, 'Complaint Review')}
          </>
        )}

        {/* Joey gets complaint review */}
        {user?.role === 'joey' && navItem('/complaints/review', <AlertTriangle size={16} />, 'Complaint Review')}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
