import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, TrendingUp, ClipboardList, ArrowRight, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatCurrency, OUTLET_COLORS } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import StatCard from '../components/Common/StatCard';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import type { OutletCode } from '../types';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const SIZE_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#14b8a6', '#f43f5e', '#84cc16', '#eab308'];

interface StockItem {
  id: string;
  sku_id: string;
  quantity: number;
  low_stock_threshold: number;
  cost_price: number;
  selling_price: number;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  frame_type: string;
  category: string;
  sold_last_30: number;
}

export default function OutletDashboard() {
  const { outletId } = useParams<{ outletId: string }>();
  const { canViewOutlet, canViewCostPrice } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [outlet, setOutlet] = useState<{ id: string; code: OutletCode; name: string } | null>(null);

  const outletCode = outletId?.toUpperCase() as OutletCode;

  useEffect(() => {
    if (!canViewOutlet(outletCode)) {
      navigate('/alerts');
      return;
    }
    fetchData();
  }, [outletId]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: outletData } = await supabase
        .from('outlets')
        .select('*')
        .eq('code', outletCode)
        .single();
      if (!outletData) return;
      setOutlet(outletData);

      const { data: balances } = await supabase
        .from('stock_balance')
        .select(`
          id, quantity, low_stock_threshold, sku_id,
          skus!inner(color_code, size, outlet_sku_prices(cost_price, selling_price, outlet_id), frame_models!inner(brand, model_code, frame_type, category))
        `)
        .eq('outlet_id', outletData.id);

      // Fetch sales in last 30 days per sku
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('sku_id, quantity')
        .eq('outlet_id', outletData.id)
        .eq('movement_type', 'out')
        .gte('created_at', thirtyDaysAgo.toISOString());

      const soldMap: Record<string, number> = {};
      (movements ?? []).forEach((m: any) => {
        soldMap[m.sku_id] = (soldMap[m.sku_id] ?? 0) + m.quantity;
      });

      const items: StockItem[] = (balances ?? []).map((b: any) => {
        const price = (b.skus?.outlet_sku_prices ?? []).find((p: any) => p.outlet_id === outletData.id)
          ?? b.skus?.outlet_sku_prices?.[0];
        return {
        id: b.id,
        sku_id: b.sku_id,
        quantity: b.quantity,
        low_stock_threshold: b.low_stock_threshold,
        cost_price: price?.cost_price ?? 0,
        selling_price: price?.selling_price ?? 0,
        brand: b.skus?.frame_models?.brand ?? '',
        model_code: b.skus?.frame_models?.model_code ?? '',
        color_code: b.skus?.color_code ?? '',
        size: b.skus?.size ?? '',
        frame_type: b.skus?.frame_models?.frame_type ?? '',
        category: b.skus?.frame_models?.category ?? '',
        sold_last_30: soldMap[b.sku_id] ?? 0,
        };
      });
      setStocks(items);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text={`Loading ${outletCode} dashboard...`} />;
  if (!outlet) return <div className="text-red-600 p-4">Outlet not found.</div>;

  const [inTransitQty, setInTransitQty] = useState(0);

  useEffect(() => {
    if (outletCode === 'PLT' && outlet) {
      supabase
        .from('transfers')
        .select('transfer_items(quantity)')
        .eq('from_outlet_id', outlet.id)
        .in('status', ['pending_confirmation', 'delivered'])
        .eq('plt_stock_deducted', false)
        .then(({ data }) => {
          const qty = (data ?? []).reduce((s: number, t: any) =>
            s + (t.transfer_items ?? []).reduce((ss: number, i: any) => ss + i.quantity, 0), 0);
          setInTransitQty(qty);
        });
    }
  }, [outlet, outletCode]);

  const totalQty = stocks.reduce((s, i) => s + i.quantity, 0);
  const totalValue = stocks.reduce((s, i) => s + i.quantity * i.cost_price, 0);
  const lowStockItems = stocks.filter((i) => i.quantity <= i.low_stock_threshold);
  const fastMovers = [...stocks].sort((a, b) => b.sold_last_30 - a.sold_last_30).slice(0, 10);

  // By frame type
  const byType: Record<string, number> = {};
  stocks.forEach((s) => { byType[s.frame_type] = (byType[s.frame_type] ?? 0) + s.quantity; });
  const typeChartData = Object.entries(byType).map(([name, value]) => ({ name, value }));

  // By category
  const byCategory: Record<string, number> = {};
  stocks.forEach((s) => { byCategory[s.category] = (byCategory[s.category] ?? 0) + s.quantity; });

  // By size
  const bySize: Record<string, number> = {};
  stocks.forEach((s) => { bySize[s.size] = (bySize[s.size] ?? 0) + s.quantity; });
  const sizeChartData = Object.entries(bySize)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([name, value]) => ({ name, value }));

  const outletColor = OUTLET_COLORS[outletCode] ?? 'bg-blue-100 text-blue-800';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${outletColor}`}>{outletCode}</span>
          <h2 className="text-2xl font-bold text-slate-800 mt-1">{outlet.name}</h2>
          <p className="text-sm text-slate-500">Inventory Dashboard</p>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Units" value={totalQty.toLocaleString()} icon={<Package size={18} />} color="blue"
          onClick={() => navigate(`/outlet/${outletId}/stock`)} />
        <StatCard label="Total SKUs" value={stocks.length} icon={<Package size={18} />} color="purple"
          onClick={() => navigate(`/outlet/${outletId}/stock`)} />
        <StatCard label="Low Stock" value={lowStockItems.length} icon={<AlertTriangle size={18} />} color={lowStockItems.length > 0 ? 'red' : 'green'}
          onClick={() => navigate(`/outlet/${outletId}/stock?filter=low`)} />
        {outletCode === 'PLT' && inTransitQty > 0 ? (
          <StatCard label="On Hold / In Transit" value={`${inTransitQty} units`} icon={<ArrowRight size={18} />} color="purple"
            onClick={() => navigate(`/outlet/${outletId}/transfers`)} />
        ) : canViewCostPrice() ? (
          <StatCard label="Stock Value" value={formatCurrency(totalValue)} icon={<TrendingUp size={18} />} color="green" />
        ) : null}
      </div>

      {/* Low Stock Alert Banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-red-600" />
            <span className="font-semibold text-red-800">{lowStockItems.length} items are below threshold</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
            {lowStockItems.slice(0, 12).map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-red-100">
                <div>
                  <div className="text-sm font-medium text-slate-700">{item.brand} {item.model_code}-{item.color_code}</div>
                  <div className="text-xs text-slate-500">Size {item.size} · {item.frame_type}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">{item.quantity}</div>
                  <div className="text-xs text-slate-400">min: {item.low_stock_threshold}</div>
                </div>
              </div>
            ))}
          </div>
          {lowStockItems.length > 12 && (
            <button onClick={() => navigate(`/outlet/${outletId}/stock?filter=low`)} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all {lowStockItems.length} low stock items <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Frame Type Pie */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Frame Type</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={typeChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {typeChartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {typeChartData.map((t, i) => (
              <div key={t.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-slate-600">{t.name}: <b>{t.value}</b></span>
              </div>
            ))}
          </div>
        </div>

        {/* Size Distribution */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Frame Size</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={sizeChartData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={30} />
              <Tooltip />
              <Bar dataKey="value" name="Qty" radius={[0, 4, 4, 0]}>
                {sizeChartData.map((_, i) => <Cell key={i} fill={SIZE_COLORS[i % SIZE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Category</h3>
          <div className="space-y-3 mt-6">
            {Object.entries(byCategory).map(([cat, qty]) => {
              const pct = Math.round((qty / totalQty) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{cat}</span>
                    <span className="font-semibold">{qty} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fast Movers */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-700">Fast Moving Items (Last 30 Days)</h3>
          </div>
          <button onClick={() => navigate(`/outlet/${outletId}/stock`)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </button>
        </div>
        {fastMovers.filter((f) => f.sold_last_30 > 0).length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No sales recorded in last 30 days.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Model</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Size</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Current Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Sold (30d)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fastMovers.filter((f) => f.sold_last_30 > 0).map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.brand} {item.model_code}</div>
                      <div className="text-xs text-slate-500">Color: {item.color_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.frame_type}</td>
                    <td className="px-4 py-3 text-slate-600">{item.size}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${item.quantity <= item.low_stock_threshold ? 'text-red-600' : 'text-slate-800'}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-green-600">{item.sold_last_30}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Stock List', icon: <Package size={20} />, path: 'stock' },
          { label: 'Daily Adjustment', icon: <ClipboardList size={20} />, path: 'adjustments' },
          { label: outletCode === 'PLT' ? 'Supply to Outlets' : 'Received Order History', icon: <ArrowRight size={20} />, path: 'transfers' },
          { label: 'Reports', icon: <TrendingUp size={20} />, path: 'reports' },
        ].map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(`/outlet/${outletId}/${action.path}`)}
            className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 transition-all"
          >
            <div className="text-blue-600">{action.icon}</div>
            <span className="text-sm font-medium text-slate-700">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
