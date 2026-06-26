import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, Search, Download, Upload, Edit2, AlertTriangle, ChevronUp, ChevronDown, History } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, FRAME_TYPES, OUTLET_COLORS } from '../../lib/utils';
import Modal from '../../components/Common/Modal';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import StockForm from './StockForm';
import type { OutletCode } from '../../types';

interface StockRow {
  balance_id: string;
  sku_id: string;
  fm_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  frame_type: string;
  category: string;
  quantity: number;
  low_stock_threshold: number;
  cost_price: number;
  selling_price: number;
  supplier_name: string;
  status: string;
}

type SortKey = 'model_code' | 'brand' | 'quantity' | 'size' | 'frame_type';

export default function StockList() {
  const { outletId } = useParams<{ outletId: string }>();
  const [searchParams] = useSearchParams();
  const { canViewCostPrice } = useAuth();
  const outletCode = outletId?.toUpperCase() as OutletCode;

  const [outlet, setOutlet] = useState<{ id: string; code: string; name: string } | null>(null);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [onlyLow, setOnlyLow] = useState(searchParams.get('filter') === 'low');
  const [sortKey, setSortKey] = useState<SortKey>('model_code');
  const [sortAsc, setSortAsc] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSku, setEditSku] = useState<StockRow | null>(null);
  const [historyRow, setHistoryRow] = useState<StockRow | null>(null);
  const [skuMovements, setSkuMovements] = useState<any[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchData(); }, [outletId]);

  async function openSkuHistory(row: StockRow) {
    setHistoryRow(row);
    setMovLoading(true);
    setSkuMovements([]);
    // Re-fetch outlet if needed
    let outletId = outlet?.id;
    if (!outletId) {
      const { data: od } = await supabase.from('outlets').select('id').eq('code', outletCode).single();
      outletId = od?.id;
    }
    if (!outletId) { setMovLoading(false); return; }
    const { data } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, notes, created_by, created_at')
      .eq('outlet_id', outletId)
      .eq('sku_id', row.sku_id)
      .order('created_at', { ascending: false })
      .limit(50);
    setSkuMovements(data ?? []);
    setMovLoading(false);
  }

  async function fetchData() {
    setLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', outletCode).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    const { data: balances } = await supabase
      .from('stock_balance')
      .select(`
        id, quantity, low_stock_threshold, sku_id,
        skus!inner(id, color_code, size, frame_model_id, status,
          outlet_sku_prices(cost_price, selling_price, outlet_id),
          frame_models!inner(id, brand, model_code, frame_type, category, suppliers(name)))
      `)
      .eq('outlet_id', outletData.id);

    const rows: StockRow[] = (balances ?? []).map((b: any) => {
      const price = (b.skus?.outlet_sku_prices ?? []).find((p: any) => p.outlet_id === outletData.id)
        ?? b.skus?.outlet_sku_prices?.[0];
      return {
        balance_id: b.id,
        sku_id: b.sku_id,
        fm_id: b.skus?.frame_models?.id ?? '',
        brand: b.skus?.frame_models?.brand ?? '',
        model_code: b.skus?.frame_models?.model_code ?? '',
        color_code: b.skus?.color_code ?? '',
        size: b.skus?.size ?? '',
        frame_type: b.skus?.frame_models?.frame_type ?? '',
        category: b.skus?.frame_models?.category ?? '',
        quantity: b.quantity,
        low_stock_threshold: b.low_stock_threshold,
        cost_price: price?.cost_price ?? 0,
        selling_price: price?.selling_price ?? 0,
        supplier_name: b.skus?.frame_models?.suppliers?.name ?? '-',
        status: b.skus?.status ?? 'active',
      };
    });
    setStocks(rows);
    setLoading(false);
  }

  const allSizes = [...new Set(stocks.map((s) => s.size))].sort((a, b) => Number(a) - Number(b));

  const filtered = stocks
    .filter((s) => {
      if (search && !`${s.brand} ${s.model_code} ${s.color_code}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType && s.frame_type !== filterType) return false;
      if (filterCat && s.category !== filterCat) return false;
      if (filterSize && s.size !== filterSize) return false;
      if (onlyLow && s.quantity > s.low_stock_threshold) return false;
      if (filterStatus === 'active' && s.status !== 'active') return false;
      if (filterStatus === 'discontinued' && s.status !== 'discontinued') return false;
      return true;
    })
    .sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(true); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return null;
    return sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  function exportExcel() {
    const rows = filtered.map((s) => ({
      Brand: s.brand, 'Model Code': s.model_code, Color: s.color_code,
      Size: s.size, Type: s.frame_type, Category: s.category,
      Quantity: s.quantity, 'Low Stock Threshold': s.low_stock_threshold,
      ...(canViewCostPrice() ? { 'Cost Price': s.cost_price, 'Selling Price': s.selling_price } : {}),
      Supplier: s.supplier_name,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    XLSX.writeFile(wb, `stock_${outletCode}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !outlet) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);
    let imported = 0;
    for (const row of rows) {
      // Upsert frame model
      const { data: fm } = await supabase.from('frame_models').upsert({
        brand: row['Brand'] ?? '', model_code: row['Model Code'] ?? '',
        frame_type: row['Type'] ?? 'Plastic', category: row['Category'] ?? 'Frame', notes: '',
      }, { onConflict: 'model_code' }).select().single();
      if (!fm) continue;
      // Upsert SKU
      const { data: sku } = await supabase.from('skus').upsert({
        frame_model_id: fm.id, color_code: row['Color'] ?? '', size: String(row['Size'] ?? ''),
        plt_cost_price: 0, plt_selling_price: 0,
      }, { onConflict: 'frame_model_id,color_code,size' }).select().single();
      if (!sku) continue;
      // Upsert balance
      await supabase.from('stock_balance').upsert({
        outlet_id: outlet.id, sku_id: sku.id, quantity: Number(row['Quantity'] ?? 0),
        low_stock_threshold: Number(row['Low Stock Threshold'] ?? 5),
      }, { onConflict: 'outlet_id,sku_id' });
      // Upsert outlet price
      await supabase.from('outlet_sku_prices').upsert({
        sku_id: sku.id, outlet_id: outlet.id,
        cost_price: Number(row['Cost Price'] ?? 0), selling_price: Number(row['Selling Price'] ?? 0),
      }, { onConflict: 'sku_id,outlet_id' });
      imported++;
    }
    alert(`Imported ${imported} items successfully.`);
    fetchData();
    e.target.value = '';
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          {outlet && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${OUTLET_COLORS[outlet.code as OutletCode] ?? ''}`}>{outlet.code}</span>}
          <h2 className="text-lg font-bold text-slate-800 mt-1">Stock Inventory</h2>
          <p className="text-sm text-slate-500">{stocks.length} SKUs · {filtered.length} shown</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={14} /> Import
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => { setEditSku(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus size={14} /> Add Stock
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search brand, model, color..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Types</option>
          {FRAME_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Categories</option>
          <option>Frame</option><option>Sunglass</option>
        </select>
        <select value={filterSize} onChange={(e) => setFilterSize(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Sizes</option>
          {allSizes.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="active">Active</option>
          <option value="discontinued">Discontinued</option>
          <option value="">All Status</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="w-4 h-4 accent-red-500" />
          <AlertTriangle size={14} className="text-red-500" /> Low Stock Only
        </label>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('brand')}>
                  <span className="flex items-center gap-1">Brand <SortIcon k="brand" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('model_code')}>
                  <span className="flex items-center gap-1">Model <SortIcon k="model_code" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Color</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('size')}>
                  <span className="flex items-center gap-1">Size <SortIcon k="size" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('frame_type')}>
                  <span className="flex items-center gap-1">Type <SortIcon k="frame_type" /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Cat.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 cursor-pointer hover:text-slate-800" onClick={() => toggleSort('quantity')}>
                  <span className="flex items-center gap-1 justify-end">Qty <SortIcon k="quantity" /></span>
                </th>
                {canViewCostPrice() && <>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Selling</th>
                </>}
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">Actions</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-slate-400">No items found.</td></tr>
              ) : filtered.map((row) => (
                <tr key={row.balance_id} className={`hover:bg-slate-50 ${row.quantity <= row.low_stock_threshold ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.brand}</td>
                  <td className="px-4 py-3 text-slate-700">{row.model_code}</td>
                  <td className="px-4 py-3 text-slate-600">{row.color_code}</td>
                  <td className="px-4 py-3 text-slate-600">{row.size}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">{row.frame_type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{row.category}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {row.quantity <= row.low_stock_threshold && <AlertTriangle size={12} className="text-red-500" />}
                      <span className={`font-bold ${row.quantity <= row.low_stock_threshold ? 'text-red-600' : 'text-slate-800'}`}>
                        {row.quantity}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">min: {row.low_stock_threshold}</div>
                  </td>
                  {canViewCostPrice() && <>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.cost_price)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(row.selling_price)}</td>
                  </>}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {row.status === 'discontinued' && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">D/C</span>
                      )}
                      <button onClick={() => { setEditSku(row); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500" title="Edit">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openSkuHistory(row)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title="View movement history">
                      <History size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditSku(null); }} title={editSku ? 'Edit Stock Item' : 'Add Stock Item'} size="lg">
        {outlet && (
          <StockForm
            outlet={outlet}
            editData={editSku}
            onSaved={() => { setShowForm(false); setEditSku(null); fetchData(); }}
            onCancel={() => { setShowForm(false); setEditSku(null); }}
            onDeleted={() => { setShowForm(false); setEditSku(null); fetchData(); }}
          />
        )}
      </Modal>

      {/* SKU Movement History Modal */}
      <Modal
        open={!!historyRow}
        onClose={() => { setHistoryRow(null); setSkuMovements([]); }}
        title={historyRow ? `${historyRow.brand} ${historyRow.model_code}-${historyRow.color_code} (Sz ${historyRow.size})` : ''}
        size="lg"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">Movement history at {outletCode} · last 50 records</span>
            <span className="text-sm font-semibold text-slate-700">Current Qty: {historyRow?.quantity ?? 0}</span>
          </div>
          {movLoading ? (
            <div className="text-center py-8 text-slate-400">Loading...</div>
          ) : skuMovements.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No movement history yet for this SKU.</div>
          ) : (
            <div className="overflow-auto max-h-96 rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Date</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Type</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Qty</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Notes / Reason</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {skuMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${m.movement_type.includes('in') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {m.movement_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${m.movement_type.includes('out') ? 'text-red-600' : 'text-green-600'}`}>
                        {m.movement_type.includes('out') ? '-' : '+'}{m.quantity}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{m.notes || '-'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{m.created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => { setEditSku(historyRow); setHistoryRow(null); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Edit2 size={13} /> Edit This SKU
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
