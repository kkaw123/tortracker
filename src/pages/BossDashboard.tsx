import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, DollarSign, ArrowRight, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatCurrency, OUTLET_COLORS } from '../lib/utils';
import StatCard from '../components/Common/StatCard';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import type { OutletCode } from '../types';

interface OutletStats {
  code: OutletCode;
  name: string;
  total_skus: number;
  total_qty: number;
  low_stock_count: number;
  total_cost_value: number;
  by_type: Record<string, number>;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const OUTLET_CHART_COLORS: Record<string, string> = {
  PLT: '#8b5cf6', SS2: '#3b82f6', KD: '#10b981', CHR: '#f59e0b'
};

export default function BossDashboard() {
  const [stats, setStats] = useState<OutletStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const navigate = useNavigate();

  useEffect(() => { fetchStats(); }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const { data: outlets } = await supabase.from('outlets').select('*');
      if (!outlets) return;

      const result: OutletStats[] = [];
      for (const outlet of outlets) {
        const { data: balances } = await supabase
          .from('stock_balance')
          .select(`quantity, low_stock_threshold, sku:skus(frame_model:frame_models(frame_type), outlet_sku_prices!inner(cost_price, outlet_id))`)
          .eq('outlet_id', outlet.id);

        let total_qty = 0, low_stock_count = 0, total_cost_value = 0;
        const by_type: Record<string, number> = {};

        (balances ?? []).forEach((b: any) => {
          total_qty += b.quantity;
          if (b.quantity <= b.low_stock_threshold) low_stock_count++;
          const price = b.sku?.outlet_sku_prices?.find((p: any) => p.outlet_id === outlet.id);
          if (price) total_cost_value += b.quantity * price.cost_price;
          const ft = b.sku?.frame_model?.frame_type;
          if (ft) by_type[ft] = (by_type[ft] ?? 0) + b.quantity;
        });

        result.push({
          code: outlet.code,
          name: outlet.name,
          total_skus: balances?.length ?? 0,
          total_qty,
          low_stock_count,
          total_cost_value,
          by_type,
        });
      }
      setStats(result);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner text="Loading overview dashboard..." />;

  const totalQty = stats.reduce((s, o) => s + o.total_qty, 0);
  const totalValue = stats.reduce((s, o) => s + o.total_cost_value, 0);
  const totalLow = stats.reduce((s, o) => s + o.low_stock_count, 0);
  const totalSkus = stats.reduce((s, o) => s + o.total_skus, 0);

  const qtyChartData = stats.map((o) => ({ name: o.code, qty: o.total_qty }));

  // Aggregate frame type breakdown
  const typeAgg: Record<string, number> = {};
  stats.forEach((o) => {
    Object.entries(o.by_type).forEach(([t, q]) => {
      typeAgg[t] = (typeAgg[t] ?? 0) + q;
    });
  });
  const typePieData = Object.entries(typeAgg).map(([name, value]) => ({ name, value }));

  // Supply recommendations: outlets with low stock
  const lowStockOutlets = stats.filter((o) => o.code !== 'PLT' && o.low_stock_count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Bird's Eye Overview</h2>
          <p className="text-sm text-slate-500">All 4 outlets · Last updated {lastUpdated.toLocaleTimeString()}</p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Stock Units" value={totalQty.toLocaleString()} icon={<Package size={18} />} color="blue" />
        <StatCard label="Total SKUs" value={totalSkus.toLocaleString()} icon={<Package size={18} />} color="purple" />
        <StatCard label="Low Stock Items" value={totalLow} icon={<AlertTriangle size={18} />} color={totalLow > 0 ? 'red' : 'green'} />
        <StatCard label="Total Stock Value" value={formatCurrency(totalValue)} icon={<DollarSign size={18} />} color="green" />
      </div>

      {/* Supply Recommendations */}
      {lowStockOutlets.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <span className="font-semibold text-amber-800">Supply Recommendations</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {lowStockOutlets.map((o) => (
              <div key={o.code} className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="font-medium text-slate-700">{o.name}</div>
                <div className="text-2xl font-bold text-red-600">{o.low_stock_count}</div>
                <div className="text-xs text-slate-500">items below threshold</div>
                <button
                  onClick={() => navigate(`/outlet/${o.code.toLowerCase()}/stock`)}
                  className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  View stock <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock qty by outlet */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Stock Quantity by Outlet</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={qtyChartData}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="qty" name="Qty" radius={[4, 4, 0, 0]}>
                {qtyChartData.map((entry) => (
                  <Cell key={entry.name} fill={OUTLET_CHART_COLORS[entry.name] ?? '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Frame type breakdown */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Stock by Frame Type (All Outlets)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={typePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {typePieData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-outlet cards */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Outlet Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((outlet) => (
            <div
              key={outlet.code}
              className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/outlet/${outlet.code.toLowerCase()}`)}
            >
              <div className={`h-1.5 ${outlet.code === 'PLT' ? 'bg-purple-500' : outlet.code === 'SS2' ? 'bg-blue-500' : outlet.code === 'KD' ? 'bg-green-500' : 'bg-orange-500'}`} />
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OUTLET_COLORS[outlet.code]}`}>{outlet.code}</span>
                    <div className="text-sm font-medium text-slate-700 mt-1">{outlet.name}</div>
                  </div>
                  <ArrowRight size={16} className="text-slate-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total Qty</span>
                    <span className="font-semibold">{outlet.total_qty.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">SKUs</span>
                    <span className="font-semibold">{outlet.total_skus}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Low Stock</span>
                    <span className={`font-semibold ${outlet.low_stock_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {outlet.low_stock_count}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Stock Value</span>
                    <span className="font-semibold text-xs">{formatCurrency(outlet.total_cost_value)}</span>
                  </div>
                </div>
                {/* Mini type breakdown */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400 mb-1.5">By Frame Type</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(outlet.by_type).slice(0, 4).map(([t, q]) => (
                      <span key={t} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {t}: {q}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
