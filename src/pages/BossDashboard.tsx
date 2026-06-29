import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle, DollarSign, ArrowRight, RefreshCw, X, TrendingUp, TrendingDown, ChevronLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../lib/supabase';
import { formatCurrency, OUTLET_COLORS } from '../lib/utils';
import StatCard from '../components/Common/StatCard';
import LoadingSpinner from '../components/Common/LoadingSpinner';
import type { OutletCode } from '../types';

interface AllStockRow {
  outlet: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  frame_type: string;
  quantity: number;
  low_stock_threshold: number;
  status: string;
}

interface SkuGroup {
  model_code: string;
  brand: string;
  total_variants: number;
  total_qty: number;
  outlets: string[];
  variants: { color: string; size: string; outlet: string; qty: number }[];
}

interface OutletStats {
  code: OutletCode;
  name: string;
  total_skus: number;
  total_qty: number;
  low_stock_count: number;
  total_cost_value: number;
  by_type: Record<string, number>;
  by_category: Record<string, number>;
}

interface SkuSalesData {
  sku_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  total_sold: number;
  last_sold_at: string | null;
  slow_moving: boolean;
  by_outlet: Record<string, { sold: number; last_sold: string | null }>;
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

  // Modal states
  const [allStockModal, setAllStockModal] = useState<'units' | 'low' | null>(null);
  const [skuGroupModal, setSkuGroupModal] = useState(false);
  const [valueModal, setValueModal] = useState(false);
  const [frameTypeModal, setFrameTypeModal] = useState(false);
  const [speedModal, setSpeedModal] = useState(false);
  const [speedTab, setSpeedTab] = useState<'best' | 'slow'>('best');
  const [speedData, setSpeedData] = useState<SkuSalesData[]>([]);
  const [speedDrill, setSpeedDrill] = useState<SkuSalesData | null>(null);
  const [slowMovingCount, setSlowMovingCount] = useState(0);
  const [allStock, setAllStock] = useState<AllStockRow[]>([]);
  const [skuGroups, setSkuGroups] = useState<SkuGroup[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  useEffect(() => { fetchStats(); }, []);

  async function openAllStockModal(mode: 'units' | 'low') {
    setAllStockModal(mode);
    setModalSearch('');
    setModalLoading(true);
    const { data: outlets } = await supabase.from('outlets').select('id, code');
    const allOutletIds = (outlets ?? []).map((o: any) => o.id);
    const outletMap: Record<string, string> = {};
    (outlets ?? []).forEach((o: any) => { outletMap[o.id] = o.code; });

    const { data: balances } = await supabase
      .from('stock_balance')
      .select(`quantity, low_stock_threshold, outlet_id, skus!inner(color_code, size, status, frame_models!inner(brand, model_code, frame_type))`)
      .in('outlet_id', allOutletIds);

    const rows: AllStockRow[] = (balances ?? []).map((b: any) => ({
      outlet: outletMap[b.outlet_id] ?? '?',
      brand: b.skus?.frame_models?.brand ?? '',
      model_code: b.skus?.frame_models?.model_code ?? '',
      color_code: b.skus?.color_code ?? '',
      size: b.skus?.size ?? '',
      frame_type: b.skus?.frame_models?.frame_type ?? '',
      quantity: b.quantity,
      low_stock_threshold: b.low_stock_threshold,
      status: b.skus?.status ?? 'active',
    }));
    setAllStock(rows.sort((a, b) => a.model_code.localeCompare(b.model_code)));
    setModalLoading(false);
  }

  async function openSkuGroupModal() {
    setSkuGroupModal(true);
    setModalSearch('');
    setModalLoading(true);
    const { data: outlets } = await supabase.from('outlets').select('id, code');
    const outletMap: Record<string, string> = {};
    (outlets ?? []).forEach((o: any) => { outletMap[o.id] = o.code; });
    const allOutletIds = (outlets ?? []).map((o: any) => o.id);

    const { data: balances } = await supabase
      .from('stock_balance')
      .select(`quantity, outlet_id, skus!inner(color_code, size, frame_models!inner(brand, model_code))`)
      .in('outlet_id', allOutletIds);

    const groups: Record<string, SkuGroup> = {};
    (balances ?? []).forEach((b: any) => {
      const mc = b.skus?.frame_models?.model_code ?? '';
      const brand = b.skus?.frame_models?.brand ?? '';
      const outlet = outletMap[b.outlet_id] ?? '?';
      if (!groups[mc]) groups[mc] = { model_code: mc, brand, total_variants: 0, total_qty: 0, outlets: [], variants: [] };
      groups[mc].total_variants++;
      groups[mc].total_qty += b.quantity;
      if (!groups[mc].outlets.includes(outlet)) groups[mc].outlets.push(outlet);
      groups[mc].variants.push({ color: b.skus?.color_code ?? '', size: b.skus?.size ?? '', outlet, qty: b.quantity });
    });

    setSkuGroups(Object.values(groups).sort((a, b) => b.total_variants - a.total_variants));
    setModalLoading(false);
  }

  async function fetchStats() {
    setLoading(true);
    try {
      const { data: outlets } = await supabase.from('outlets').select('*');
      if (!outlets) return;

      const result: OutletStats[] = [];
      for (const outlet of outlets) {
        const { data: balances } = await supabase
          .from('stock_balance')
          .select(`quantity, low_stock_threshold, sku:skus(status, frame_model:frame_models(frame_type, category), outlet_sku_prices!inner(cost_price, outlet_id))`)
          .eq('outlet_id', outlet.id);

        let total_qty = 0, low_stock_count = 0, total_cost_value = 0;
        const by_type: Record<string, number> = {};
        const by_category: Record<string, number> = {};

        (balances ?? []).forEach((b: any) => {
          total_qty += b.quantity;
          const skuStatus = b.sku?.status ?? 'active';
          if (b.quantity <= b.low_stock_threshold && skuStatus !== 'discontinued') low_stock_count++;
          const price = b.sku?.outlet_sku_prices?.find((p: any) => p.outlet_id === outlet.id);
          if (price) total_cost_value += b.quantity * price.cost_price;
          const ft = b.sku?.frame_model?.frame_type;
          if (ft) by_type[ft] = (by_type[ft] ?? 0) + b.quantity;
          const cat = b.sku?.frame_model?.category;
          if (cat) by_category[cat] = (by_category[cat] ?? 0) + b.quantity;
        });

        result.push({
          code: outlet.code,
          name: outlet.name,
          total_skus: balances?.length ?? 0,
          total_qty,
          low_stock_count,
          total_cost_value,
          by_type,
          by_category,
        });
      }
      setStats(result);
      setLastUpdated(new Date());

      // Quick slow-moving count for stat card
      const { count: smCount } = await supabase
        .from('skus')
        .select('id', { count: 'exact', head: true })
        .eq('slow_moving', true)
        .eq('status', 'active');
      setSlowMovingCount(smCount ?? 0);
    } finally {
      setLoading(false);
    }
  }

  async function openSpeedModal() {
    setSpeedModal(true);
    setSpeedTab('best');
    setSpeedDrill(null);
    setModalSearch('');
    setModalLoading(true);

    // Non-PLT outlets only (the selling outlets)
    const { data: outlets } = await supabase.from('outlets').select('id, code').neq('code', 'PLT');
    const outletMap: Record<string, string> = {};
    const outletIds: string[] = [];
    (outlets ?? []).forEach((o: any) => { outletMap[o.id] = o.code; outletIds.push(o.id); });
    const outletCodes = ['SS2', 'KD', 'CHR'];

    // All "Sold" stock_out movements from selling outlets
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('sku_id, quantity, created_at, outlet_id, skus!inner(color_code, size, slow_moving, frame_models!inner(brand, model_code))')
      .in('outlet_id', outletIds)
      .eq('movement_type', 'out')
      .ilike('notes', 'Sold%');

    // All active SKUs across selling outlets (to catch zero-sales items)
    const { data: balances } = await supabase
      .from('stock_balance')
      .select('sku_id, skus!inner(color_code, size, slow_moving, status, frame_models!inner(brand, model_code))')
      .in('outlet_id', outletIds);

    const salesMap: Record<string, SkuSalesData> = {};

    // Seed from balances so zero-sale active SKUs appear in Slow Moving
    (balances ?? []).forEach((b: any) => {
      if ((b.skus?.status ?? 'active') === 'discontinued') return;
      const id = b.sku_id;
      if (!salesMap[id]) {
        salesMap[id] = {
          sku_id: id,
          brand: b.skus?.frame_models?.brand ?? '',
          model_code: b.skus?.frame_models?.model_code ?? '',
          color_code: b.skus?.color_code ?? '',
          size: b.skus?.size ?? '',
          total_sold: 0,
          last_sold_at: null,
          slow_moving: b.skus?.slow_moving ?? false,
          by_outlet: Object.fromEntries(outletCodes.map((c) => [c, { sold: 0, last_sold: null }])),
        };
      }
    });

    // Accumulate sales
    (movements ?? []).forEach((m: any) => {
      const id = m.sku_id;
      const outlet = outletMap[m.outlet_id] ?? '?';
      if (!salesMap[id]) {
        salesMap[id] = {
          sku_id: id,
          brand: m.skus?.frame_models?.brand ?? '',
          model_code: m.skus?.frame_models?.model_code ?? '',
          color_code: m.skus?.color_code ?? '',
          size: m.skus?.size ?? '',
          total_sold: 0,
          last_sold_at: null,
          slow_moving: m.skus?.slow_moving ?? false,
          by_outlet: Object.fromEntries(outletCodes.map((c) => [c, { sold: 0, last_sold: null }])),
        };
      }
      salesMap[id].total_sold += m.quantity;
      if (!salesMap[id].last_sold_at || m.created_at > salesMap[id].last_sold_at!) {
        salesMap[id].last_sold_at = m.created_at;
      }
      if (!salesMap[id].by_outlet[outlet]) salesMap[id].by_outlet[outlet] = { sold: 0, last_sold: null };
      salesMap[id].by_outlet[outlet].sold += m.quantity;
      if (!salesMap[id].by_outlet[outlet].last_sold || m.created_at > salesMap[id].by_outlet[outlet].last_sold!) {
        salesMap[id].by_outlet[outlet].last_sold = m.created_at;
      }
    });

    // Auto-mark slow moving (90-day rule)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const toSlow: string[] = [], toActive: string[] = [];

    Object.values(salesMap).forEach((row) => {
      const isAutoSlow = !row.last_sold_at || new Date(row.last_sold_at) < cutoff;
      row.slow_moving = isAutoSlow;
      if (isAutoSlow) toSlow.push(row.sku_id);
      else toActive.push(row.sku_id);
    });

    if (toSlow.length > 0) await supabase.from('skus').update({ slow_moving: true }).in('id', toSlow);
    if (toActive.length > 0) await supabase.from('skus').update({ slow_moving: false }).in('id', toActive);
    setSlowMovingCount(toSlow.length);

    setSpeedData(Object.values(salesMap));
    setModalLoading(false);
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Stock Units" value={totalQty.toLocaleString()} icon={<Package size={18} />} color="blue"
          onClick={() => openAllStockModal('units')} />
        <StatCard label="Total SKUs" value={totalSkus.toLocaleString()} icon={<Package size={18} />} color="purple"
          onClick={() => openSkuGroupModal()} />
        <StatCard label="Low Stock Items" value={totalLow} icon={<AlertTriangle size={18} />} color={totalLow > 0 ? 'red' : 'green'}
          onClick={() => openAllStockModal('low')} />
        <StatCard label="Total Stock Value" value={formatCurrency(totalValue)} icon={<DollarSign size={18} />} color="green"
          onClick={() => setValueModal(true)} />
        <StatCard
          label="Stock Moving Speed"
          value={slowMovingCount > 0 ? `${slowMovingCount} Slow Moving` : 'All Active'}
          icon={slowMovingCount > 0 ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
          color={slowMovingCount > 0 ? 'red' : 'green'}
          onClick={openSpeedModal}
        />
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

        {/* Frame type breakdown — clickable */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">Stock by Frame Type (All Outlets)</h3>
            <button
              onClick={() => setFrameTypeModal(true)}
              className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              View Details →
            </button>
          </div>
          <div className="cursor-pointer" onClick={() => setFrameTypeModal(true)}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart onClick={() => setFrameTypeModal(true)}>
                <Pie data={typePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {typePieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stock Value Breakdown Modal */}
      {valueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-16 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Stock Value Breakdown by Outlet</h3>
                <p className="text-xs text-slate-400 mt-0.5">Total inventory cost value across all outlets</p>
              </div>
              <button onClick={() => setValueModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="overflow-auto flex-1 p-5 space-y-4">
              {stats.map((o) => {
                const pct = totalValue > 0 ? Math.round((o.total_cost_value / totalValue) * 100) : 0;
                return (
                  <div key={o.code} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OUTLET_COLORS[o.code] ?? ''}`}>{o.code}</span>
                        <span className="text-sm font-semibold text-slate-700">{o.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-800">{formatCurrency(o.total_cost_value)}</div>
                        <div className="text-xs text-slate-400">{pct}% of total · {o.total_skus} SKUs · {o.total_qty} units</div>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1.5">By Frame Type</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(o.by_type).map(([t, q]) => (
                            <span key={t} className="text-xs bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t}: <b>{q}</b></span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500 mb-1.5">By Category</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(o.by_category).map(([c, q]) => (
                            <span key={c} className="text-xs bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{c}: <b>{q}</b></span>
                          ))}
                          {o.low_stock_count > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">⚠ {o.low_stock_count} low stock</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-slate-200 pt-4 flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-600">Total across all outlets</span>
                <span className="text-xl font-bold text-green-700">{formatCurrency(totalValue)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Stock / Low Stock Modal */}
      {allStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-16 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {allStockModal === 'low' ? '⚠ Low Stock Items — All Outlets' : 'All Stock Units — All Outlets'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Live view across PLT, SS2, KD, CHR</p>
              </div>
              <button onClick={() => setAllStockModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-50">
              <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder="Search model, brand, color..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {modalLoading ? (
              <div className="p-12 text-center text-slate-400">Loading...</div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Outlet','Brand','Model','Color','Size','Type','Qty','Status'].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allStock
                      .filter((r) => allStockModal === 'low' ? r.quantity <= r.low_stock_threshold : true)
                      .filter((r) => !modalSearch || `${r.brand} ${r.model_code} ${r.color_code}`.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((r, i) => (
                        <tr key={i} className={`hover:bg-slate-50 ${r.quantity <= r.low_stock_threshold ? 'bg-red-50' : ''}`}>
                          <td className="px-3 py-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${OUTLET_COLORS[r.outlet as OutletCode] ?? 'bg-slate-100 text-slate-600'}`}>{r.outlet}</span></td>
                          <td className="px-3 py-2 font-medium text-slate-800">{r.brand}</td>
                          <td className="px-3 py-2 text-slate-700">{r.model_code}</td>
                          <td className="px-3 py-2 text-slate-600">{r.color_code}</td>
                          <td className="px-3 py-2 text-slate-600">{r.size}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{r.frame_type}</td>
                          <td className={`px-3 py-2 font-bold ${r.quantity <= r.low_stock_threshold ? 'text-red-600' : 'text-slate-800'}`}>{r.quantity}</td>
                          <td className="px-3 py-2">
                            {r.status === 'discontinued'
                              ? <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">D/C</span>
                              : <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SKU Groups Modal */}
      {skuGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-16 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">SKU Analysis — Model Code Groups</h3>
                <p className="text-xs text-slate-400 mt-0.5">Shows all model codes ranked by number of variants. High variants = more variety of the same model.</p>
              </div>
              <button onClick={() => setSkuGroupModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-50">
              <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)} placeholder="Search model code..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {modalLoading ? (
              <div className="p-12 text-center text-slate-400">Loading...</div>
            ) : (
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Model Code</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Brand</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Variants</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Outlets</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Colors / Sizes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {skuGroups
                      .filter((g) => !modalSearch || g.model_code.toLowerCase().includes(modalSearch.toLowerCase()) || g.brand.toLowerCase().includes(modalSearch.toLowerCase()))
                      .map((g) => (
                        <tr key={g.model_code} className={`hover:bg-slate-50 ${g.total_variants >= 5 ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800 font-mono">{g.model_code}</td>
                          <td className="px-4 py-2.5 text-slate-600">{g.brand}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold text-sm px-2 py-0.5 rounded-full ${g.total_variants >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                              {g.total_variants}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{g.total_qty}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{g.outlets.join(', ')}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              {g.variants.slice(0, 6).map((v, i) => (
                                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{v.color}/{v.size}</span>
                              ))}
                              {g.variants.length > 6 && <span className="text-xs text-slate-400">+{g.variants.length - 6} more</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Frame Type Detail Modal */}
      {frameTypeModal && (() => {
        const allTypes = [...new Set(stats.flatMap((o) => Object.keys(o.by_type)))].sort();
        const typeColors: Record<string, string> = Object.fromEntries(
          allTypes.map((t, i) => [t, CHART_COLORS[i % CHART_COLORS.length]])
        );
        return (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-10 px-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Stock by Frame Type — All Outlets</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Quantity breakdown per frame type, per branch</p>
                </div>
                <button onClick={() => setFrameTypeModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>

              <div className="overflow-auto flex-1 p-6 space-y-8">

                {/* ── Combined overview ── */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Combined — All Outlets</h4>
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    {/* Big combined pie */}
                    <div className="w-full md:w-64 shrink-0">
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={typePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85}
                            label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={false}>
                            {typePieData.map((entry) => (
                              <Cell key={entry.name} fill={typeColors[entry.name] ?? '#94a3b8'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => [v, 'units']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Combined totals table */}
                    <div className="flex-1 w-full">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 rounded-lg">
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Frame Type</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Total Qty</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">% of Total</th>
                            {stats.map((o) => (
                              <th key={o.code} className="text-right px-3 py-2 text-xs font-semibold text-slate-500">{o.code}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {typePieData.sort((a, b) => b.value - a.value).map((row) => {
                            const pct = totalQty > 0 ? ((row.value / totalQty) * 100).toFixed(1) : '0';
                            return (
                              <tr key={row.name} className="hover:bg-slate-50">
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: typeColors[row.name] ?? '#94a3b8' }} />
                                    <span className="font-medium text-slate-800">{row.name}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-slate-800">{row.value}</td>
                                <td className="px-3 py-2.5 text-right text-slate-500">{pct}%</td>
                                {stats.map((o) => (
                                  <td key={o.code} className="px-3 py-2.5 text-right text-slate-600">
                                    {o.by_type[row.name] ?? 0}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-slate-700">Total</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{totalQty}</td>
                            <td className="px-3 py-2 text-right text-slate-500">100%</td>
                            {stats.map((o) => (
                              <td key={o.code} className="px-3 py-2 text-right font-semibold text-slate-700">{o.total_qty}</td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

                {/* ── Per-outlet breakdown ── */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">Per-Branch Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {stats.map((outlet) => {
                      const outletTotal = outlet.total_qty;
                      const outletPieData = Object.entries(outlet.by_type)
                        .map(([name, value]) => ({ name, value }))
                        .sort((a, b) => b.value - a.value);
                      const barColor = OUTLET_CHART_COLORS[outlet.code] ?? '#94a3b8';
                      return (
                        <div key={outlet.code} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          {/* Outlet header */}
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OUTLET_COLORS[outlet.code] ?? ''}`}>{outlet.code}</span>
                            <span className="text-sm font-semibold text-slate-700">{outlet.name}</span>
                            <span className="ml-auto text-xs text-slate-400">{outletTotal} units total</span>
                          </div>

                          <div className="flex gap-4 items-center">
                            {/* Per-outlet pie */}
                            <div className="shrink-0 w-40 h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={outletPieData} dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={58} innerRadius={22}
                                    label={false}>
                                    {outletPieData.map((entry) => (
                                      <Cell key={entry.name} fill={typeColors[entry.name] ?? '#94a3b8'} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(v: any) => [v, 'units']} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Per-outlet type rows */}
                            <div className="flex-1 space-y-1.5">
                              {outletPieData.length === 0 ? (
                                <div className="text-sm text-slate-400">No stock data</div>
                              ) : outletPieData.map((row) => {
                                const pct = outletTotal > 0 ? Math.round((row.value / outletTotal) * 100) : 0;
                                return (
                                  <div key={row.name}>
                                    <div className="flex justify-between text-xs mb-0.5">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: typeColors[row.name] ?? '#94a3b8' }} />
                                        <span className="text-slate-700 font-medium">{row.name}</span>
                                      </div>
                                      <div className="text-slate-600 font-semibold tabular-nums">
                                        {row.value} <span className="text-slate-400 font-normal">({pct}%)</span>
                                      </div>
                                    </div>
                                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Stock Moving Speed Modal ── */}
      {speedModal && (() => {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const daysSince = (d: string | null) => {
          if (!d) return null;
          return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
        };
        const fmtDate = (d: string | null) => {
          if (!d) return '—';
          return new Date(d).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: '2-digit' });
        };

        const bestSellers = [...speedData]
          .filter((r) => r.total_sold > 0)
          .sort((a, b) => b.total_sold - a.total_sold);
        const slowMovers = [...speedData]
          .filter((r) => r.slow_moving)
          .sort((a, b) => (a.last_sold_at ?? '').localeCompare(b.last_sold_at ?? ''));
        const tableRows = speedTab === 'best' ? bestSellers : slowMovers;
        const filtered = tableRows.filter((r) =>
          !modalSearch || `${r.brand} ${r.model_code} ${r.color_code}`.toLowerCase().includes(modalSearch.toLowerCase())
        );
        const outletCodes = ['SS2', 'KD', 'CHR'];
        const maxSold = Math.max(...bestSellers.map((r) => r.total_sold), 1);

        return (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-10 px-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  {speedDrill && (
                    <button onClick={() => setSpeedDrill(null)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
                      <ChevronLeft size={16} /> Back
                    </button>
                  )}
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      {speedDrill
                        ? `${speedDrill.brand} ${speedDrill.model_code}-${speedDrill.color_code} (Size ${speedDrill.size})`
                        : 'Stock Moving Speed — SS2 · KD · CHR'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {speedDrill
                        ? 'Per-outlet sales breakdown'
                        : 'Based on Daily Adjustment "Sold" entries · Slow Moving = no sales in 90+ days'}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setSpeedModal(false); setSpeedDrill(null); }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
              </div>

              {!speedDrill && (
                <>
                  {/* Tabs */}
                  <div className="flex border-b border-slate-100 px-6">
                    {(['best', 'slow'] as const).map((tab) => (
                      <button key={tab} onClick={() => { setSpeedTab(tab); setModalSearch(''); }}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          speedTab === tab
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}>
                        {tab === 'best'
                          ? `🔥 Best Sellers (${bestSellers.length})`
                          : `🐌 Slow Moving (${slowMovers.length})`}
                      </button>
                    ))}
                  </div>
                  {/* Search */}
                  <div className="px-6 py-3 border-b border-slate-50">
                    <input value={modalSearch} onChange={(e) => setModalSearch(e.target.value)}
                      placeholder="Search brand, model, color..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              )}

              {modalLoading ? (
                <div className="p-12 text-center text-slate-400 text-sm">Analysing sales data...</div>
              ) : speedDrill ? (
                /* ── Drill-down: per-outlet breakdown ── */
                <div className="overflow-auto flex-1 p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {outletCodes.map((oc) => {
                      const d = speedDrill.by_outlet[oc] ?? { sold: 0, last_sold: null };
                      const days = daysSince(d.last_sold);
                      const pct = speedDrill.total_sold > 0 ? Math.round((d.sold / speedDrill.total_sold) * 100) : 0;
                      const color = oc === 'SS2' ? '#3b82f6' : oc === 'KD' ? '#10b981' : '#f59e0b';
                      return (
                        <div key={oc} className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                          <div className="flex items-center justify-between mb-4">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OUTLET_COLORS[oc as OutletCode] ?? 'bg-slate-100 text-slate-600'}`}>{oc}</span>
                            {d.sold === 0
                              ? <span className="text-xs text-slate-400">No sales recorded</span>
                              : <span className="text-xs text-green-600 font-medium">{pct}% of total</span>
                            }
                          </div>
                          <div className="text-4xl font-bold text-slate-800 mb-1">{d.sold}</div>
                          <div className="text-xs text-slate-400 mb-3">units sold</div>
                          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                          <div className="text-xs text-slate-500">
                            Last sold: <span className="font-medium text-slate-700">{fmtDate(d.last_sold)}</span>
                            {days !== null && <span className="text-slate-400 ml-1">({days}d ago)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Total sold across all outlets</span>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-blue-700">{speedDrill.total_sold}</span>
                      <span className="text-xs text-slate-400 ml-1">units</span>
                    </div>
                  </div>
                  {speedDrill.slow_moving && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                      <TrendingDown size={15} className="shrink-0" />
                      No sales in the last 90 days — automatically marked as Slow Moving.
                    </div>
                  )}
                </div>
              ) : (
                /* ── Main table ── */
                <div className="overflow-auto flex-1">
                  {filtered.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 text-sm">
                      {speedTab === 'best' ? 'No sales recorded yet.' : 'No slow moving items — great job!'}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['Brand','Model','Color','Size','Total Sold','Last Sold',
                            ...outletCodes,''].map((h) => (
                            <th key={h} className={`px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase ${h === '' || h === 'Total Sold' ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filtered.map((row) => {
                          const days = daysSince(row.last_sold_at);
                          const barW = speedTab === 'best' ? Math.round((row.total_sold / maxSold) * 100) : 0;
                          return (
                            <tr key={row.sku_id}
                              className="hover:bg-blue-50 cursor-pointer transition-colors"
                              onClick={() => setSpeedDrill(row)}>
                              <td className="px-3 py-2.5 font-medium text-slate-800">{row.brand}</td>
                              <td className="px-3 py-2.5 font-mono text-slate-700">{row.model_code}</td>
                              <td className="px-3 py-2.5 text-slate-600">{row.color_code}</td>
                              <td className="px-3 py-2.5 text-slate-500">{row.size}</td>
                              <td className="px-3 py-2.5 text-right">
                                {speedTab === 'best' ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${barW}%` }} />
                                    </div>
                                    <span className="font-bold text-blue-700 w-8 text-right">{row.total_sold}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-500">{row.total_sold}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                {fmtDate(row.last_sold_at)}
                                {days !== null && days > 90 && (
                                  <span className="ml-1 text-amber-600">({days}d)</span>
                                )}
                                {row.last_sold_at === null && (
                                  <span className="text-red-400">Never</span>
                                )}
                              </td>
                              {outletCodes.map((oc) => (
                                <td key={oc} className="px-3 py-2.5 text-right text-slate-600">
                                  {(row.by_outlet[oc]?.sold ?? 0) > 0
                                    ? <span className="font-medium">{row.by_outlet[oc].sold}</span>
                                    : <span className="text-slate-300">—</span>}
                                </td>
                              ))}
                              <td className="px-3 py-2.5 text-slate-300 text-right">
                                <ArrowRight size={14} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
