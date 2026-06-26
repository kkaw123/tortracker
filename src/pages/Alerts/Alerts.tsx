import { useEffect, useState } from 'react';
import { Bell, CheckCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, OUTLET_COLORS } from '../../lib/utils';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { OutletCode } from '../../types';

interface AlertRow {
  id: string;
  outlet_code: OutletCode;
  outlet_name: string;
  sku_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  quantity: number;
  threshold: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function Alerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRead, setShowRead] = useState(false);

  useEffect(() => { fetchAlerts(); }, []);

  async function fetchAlerts() {
    setLoading(true);
    let query = supabase
      .from('alerts')
      .select(`id, alert_type, message, is_read, created_at, sku_id,
        outlets!inner(code, name),
        skus!inner(color_code, size, frame_models!inner(brand, model_code)),
        stock_balance!inner(quantity, low_stock_threshold)`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (user?.role !== 'boss' && user?.role !== 'joey' && user?.outlet_code !== 'PLT') {
      query = query.eq('outlet_id', user?.outlet_id!);
    }

    const { data } = await query;
    setAlerts((data ?? []).map((a: any) => ({
      id: a.id,
      outlet_code: a.outlets?.code ?? '',
      outlet_name: a.outlets?.name ?? '',
      sku_id: a.sku_id,
      brand: a.skus?.frame_models?.brand ?? '',
      model_code: a.skus?.frame_models?.model_code ?? '',
      color_code: a.skus?.color_code ?? '',
      size: a.skus?.size ?? '',
      quantity: a.stock_balance?.[0]?.quantity ?? 0,
      threshold: a.stock_balance?.[0]?.low_stock_threshold ?? 0,
      message: a.message,
      is_read: a.is_read,
      created_at: a.created_at,
    })));
    setLoading(false);
  }

  async function markRead(id: string) {
    await supabase.from('alerts').update({ is_read: true }).eq('id', id);
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, is_read: true } : a));
  }

  async function markAllRead() {
    const unread = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unread.length === 0) return;
    await supabase.from('alerts').update({ is_read: true }).in('id', unread);
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  }

  const displayed = showRead ? alerts : alerts.filter((a) => !a.is_read);
  const unreadCount = alerts.filter((a) => !a.is_read).length;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Alerts</h2>
          <p className="text-sm text-slate-500">
            {unreadCount} unread · {alerts.length} total
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} className="w-4 h-4" />
            Show read
          </label>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
          <Bell size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">{showRead ? 'No alerts found.' : 'No unread alerts. You\'re all caught up!'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((alert) => (
            <div
              key={alert.id}
              className={`bg-white rounded-xl p-4 shadow-sm border flex items-center gap-4 ${alert.is_read ? 'border-slate-100 opacity-70' : 'border-red-200 bg-red-50'}`}
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${alert.is_read ? 'bg-slate-100' : 'bg-red-100'}`}>
                <AlertTriangle size={18} className={alert.is_read ? 'text-slate-400' : 'text-red-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[alert.outlet_code] ?? ''}`}>{alert.outlet_code}</span>
                  <span className="text-xs text-red-600 font-semibold bg-red-100 px-2 py-0.5 rounded-full">Low Stock</span>
                </div>
                <div className="mt-1 font-semibold text-slate-800">
                  {alert.brand} {alert.model_code}-{alert.color_code} (Size {alert.size})
                </div>
                <div className="text-sm text-slate-600">
                  Current: <span className="font-bold text-red-600">{alert.quantity}</span> · Threshold: {alert.threshold}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{formatDateTime(alert.created_at)}</div>
              </div>
              {!alert.is_read && (
                <button
                  onClick={() => markRead(alert.id)}
                  className="flex-shrink-0 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-white bg-white"
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
