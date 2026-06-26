import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Save, History, Search, RefreshCw, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import Modal from '../../components/Common/Modal';
import type { OutletCode } from '../../types';

const OUT_REASONS = ['Sold', 'Transfer', 'Claim', 'Defect', 'Exchange'];

interface AdjRow {
  sku_id: string;
  balance_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  frame_type: string;
  opening_qty: number;
  stock_in: number;
  stock_out: number;
  closing_qty: number;
  changed: boolean;
  stock_in_remarks: string;
  stock_out_reason: string;
  reference_number: string;
}

interface HistoryItem {
  id: string;
  date: string;
  submitted_by: string;
  notes: string;
  items_count: number;
  total_in: number;
  total_out: number;
}

interface SKUMovement {
  id: string;
  movement_type: string;
  quantity: number;
  notes: string;
  created_by: string;
  created_at: string;
}

export default function DailyAdjustment() {
  const { outletId } = useParams<{ outletId: string }>();
  const { user } = useAuth();
  const outletCode = outletId?.toUpperCase() as OutletCode;
  const today = format(new Date(), 'yyyy-MM-dd');

  const [outlet, setOutlet] = useState<{ id: string; code: string } | null>(null);
  const [rows, setRows] = useState<AdjRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'form' | 'history'>('form');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // SKU history modal
  const [historyRow, setHistoryRow] = useState<AdjRow | null>(null);
  const [skuMovements, setSkuMovements] = useState<SKUMovement[]>([]);
  const [movLoading, setMovLoading] = useState(false);

  // Exchange modal
  const [exchangeSourceRow, setExchangeSourceRow] = useState<AdjRow | null>(null);
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeRef, setExchangeRef] = useState('');

  useEffect(() => { fetchData(); }, [outletId]);
  useEffect(() => { if (view === 'history') fetchHistory(); }, [view]);

  async function fetchData() {
    setLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', outletCode).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    const { data: existing } = await supabase
      .from('daily_adjustments')
      .select('id')
      .eq('outlet_id', outletData.id)
      .eq('date', today)
      .single();
    setAlreadySubmitted(!!existing);

    const { data: balances } = await supabase
      .from('stock_balance')
      .select(`id, quantity, sku_id, skus!inner(color_code, size, frame_models!inner(brand, model_code, frame_type))`)
      .eq('outlet_id', outletData.id);

    const adjRows: AdjRow[] = (balances ?? []).map((b: any) => ({
      sku_id: b.sku_id,
      balance_id: b.id,
      brand: b.skus?.frame_models?.brand ?? '',
      model_code: b.skus?.frame_models?.model_code ?? '',
      color_code: b.skus?.color_code ?? '',
      size: b.skus?.size ?? '',
      frame_type: b.skus?.frame_models?.frame_type ?? '',
      opening_qty: b.quantity,
      stock_in: 0,
      stock_out: 0,
      closing_qty: b.quantity,
      changed: false,
      stock_in_remarks: '',
      stock_out_reason: '',
      reference_number: '',
    }));
    setRows(adjRows.sort((a, b) => a.model_code.localeCompare(b.model_code)));
    setLoading(false);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('id').eq('code', outletCode).single();
    if (!outletData) { setHistoryLoading(false); return; }
    const { data: adjs } = await supabase
      .from('daily_adjustments')
      .select('id, date, submitted_by, notes, daily_adjustment_items(stock_in, stock_out)')
      .eq('outlet_id', outletData.id)
      .order('date', { ascending: false })
      .limit(60);
    const items: HistoryItem[] = (adjs ?? []).map((a: any) => ({
      id: a.id,
      date: a.date,
      submitted_by: a.submitted_by,
      notes: a.notes,
      items_count: a.daily_adjustment_items?.length ?? 0,
      total_in: (a.daily_adjustment_items ?? []).reduce((s: number, i: any) => s + i.stock_in, 0),
      total_out: (a.daily_adjustment_items ?? []).reduce((s: number, i: any) => s + i.stock_out, 0),
    }));
    setHistory(items);
    setHistoryLoading(false);
  }

  async function openSkuHistory(row: AdjRow) {
    setHistoryRow(row);
    setMovLoading(true);
    setSkuMovements([]);
    const { data: outletData } = await supabase.from('outlets').select('id').eq('code', outletCode).single();
    if (!outletData) { setMovLoading(false); return; }
    const { data: movs } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, notes, created_by, created_at')
      .eq('outlet_id', outletData.id)
      .eq('sku_id', row.sku_id)
      .order('created_at', { ascending: false })
      .limit(50);
    setSkuMovements(movs ?? []);
    setMovLoading(false);
  }

  function updateRow(idx: number, field: 'stock_in' | 'stock_out', val: string) {
    setRows((prev) => {
      const updated = [...prev];
      const r = { ...updated[idx] };
      r[field] = Math.max(0, Number(val) || 0);
      r.closing_qty = r.opening_qty + r.stock_in - r.stock_out;
      r.changed = r.stock_in !== 0 || r.stock_out !== 0;
      if (r.stock_out === 0) { r.stock_out_reason = ''; r.reference_number = ''; }
      updated[idx] = r;
      return updated;
    });
  }

  function updateRowField(idx: number, field: 'stock_in_remarks' | 'stock_out_reason' | 'reference_number', val: string) {
    setRows((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  }

  function openExchange(row: AdjRow) {
    setExchangeSourceRow(row);
    setExchangeSearch('');
    setExchangeRef('');
  }

  function applyExchange(returnRow: AdjRow) {
    if (!exchangeSourceRow) return;
    const ref = exchangeRef || `EX-${Date.now().toString().slice(-6)}`;
    setRows((prev) => prev.map((r) => {
      if (r.sku_id === exchangeSourceRow.sku_id) {
        return { ...r, stock_out: 1, closing_qty: r.opening_qty - 1, changed: true, stock_out_reason: 'Exchange', reference_number: ref };
      }
      if (r.sku_id === returnRow.sku_id) {
        return { ...r, stock_in: 1, closing_qty: r.opening_qty + 1, changed: true, stock_in_remarks: `Exchange return ref: ${ref}` };
      }
      return r;
    }));
    setExchangeSourceRow(null);
  }

  async function handleSubmit() {
    if (!outlet || !user) return;
    const changedRows = rows.filter((r) => r.changed);
    if (changedRows.length === 0) {
      alert('No changes recorded. Please enter at least one stock in or out value.');
      return;
    }
    // Validate reasons
    const missingReason = changedRows.find((r) => r.stock_out > 0 && !r.stock_out_reason);
    if (missingReason) {
      alert(`Please select a reason for stock out on: ${missingReason.brand} ${missingReason.model_code}`);
      return;
    }
    setSaving(true);
    try {
      const { data: adj, error: adjErr } = await supabase
        .from('daily_adjustments')
        .insert({ outlet_id: outlet.id, date: today, submitted_by: user.name, notes })
        .select()
        .single();
      if (adjErr) throw new Error(adjErr.message);

      const adjItems = changedRows.map((r) => ({
        adjustment_id: adj.id,
        sku_id: r.sku_id,
        opening_qty: r.opening_qty,
        stock_in: r.stock_in,
        stock_out: r.stock_out,
        closing_qty: r.closing_qty,
        stock_out_reason: r.stock_out_reason || null,
        reference_number: r.reference_number || null,
        stock_in_remarks: r.stock_in_remarks || null,
      }));
      await supabase.from('daily_adjustment_items').insert(adjItems);

      for (const r of changedRows) {
        await supabase
          .from('stock_balance')
          .update({ quantity: r.closing_qty, updated_at: new Date().toISOString() })
          .eq('id', r.balance_id);

        if (r.stock_in > 0) {
          await supabase.from('stock_movements').insert({
            outlet_id: outlet.id, sku_id: r.sku_id, movement_type: 'in',
            quantity: r.stock_in, reference_id: adj.id,
            notes: r.stock_in_remarks || 'Daily adjustment',
            created_by: user.name,
          });
        }
        if (r.stock_out > 0) {
          await supabase.from('stock_movements').insert({
            outlet_id: outlet.id, sku_id: r.sku_id, movement_type: 'out',
            quantity: r.stock_out, reference_id: adj.id,
            notes: `${r.stock_out_reason}${r.reference_number ? ' | Ref: ' + r.reference_number : ''}`,
            created_by: user.name,
          });
        }

        const balance = await supabase.from('stock_balance').select('low_stock_threshold').eq('id', r.balance_id).single();
        if (balance.data && r.closing_qty <= balance.data.low_stock_threshold) {
          await supabase.from('alerts').upsert({
            outlet_id: outlet.id, sku_id: r.sku_id, alert_type: 'low_stock',
            message: `Low stock: ${r.brand} ${r.model_code}-${r.color_code} (Size ${r.size}) — Qty: ${r.closing_qty}`,
            is_read: false,
          }, { onConflict: 'outlet_id,sku_id,alert_type' });
        }
      }

      alert(`Adjustment submitted for ${today}. ${changedRows.length} items updated.`);
      setAlreadySubmitted(true);
      fetchData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((r) =>
    !search || `${r.brand} ${r.model_code} ${r.color_code}`.toLowerCase().includes(search.toLowerCase())
  );
  const exchangeFiltered = rows.filter((r) =>
    exchangeSourceRow && r.sku_id !== exchangeSourceRow.sku_id &&
    (!exchangeSearch || `${r.brand} ${r.model_code} ${r.color_code}`.toLowerCase().includes(exchangeSearch.toLowerCase()))
  );
  const changedCount = rows.filter((r) => r.changed).length;
  const totalIn = rows.reduce((s, r) => s + r.stock_in, 0);
  const totalOut = rows.reduce((s, r) => s + r.stock_out, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Header tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Daily Stock Adjustment</h2>
          <p className="text-sm text-slate-500">{today} · {outletCode}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('form')} className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'form' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            Today's Adjustment
          </button>
          <button onClick={() => setView('history')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${view === 'history' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            <History size={14} /> History
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {historyLoading ? <LoadingSpinner /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Submitted By</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Items</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total In</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Out</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">No history yet.</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{formatDate(h.date)}</td>
                    <td className="px-4 py-3 text-slate-600">{h.submitted_by}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{h.items_count}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-semibold">+{h.total_in}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-semibold">-{h.total_out}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{h.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <>
          {alreadySubmitted && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
              Today's adjustment has already been submitted. You can submit again to record additional changes.
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-center">
              <div className="text-2xl font-bold text-slate-800">{changedCount}</div>
              <div className="text-xs text-slate-500 mt-1">Items Changed</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-center">
              <div className="text-2xl font-bold text-green-600">+{totalIn}</div>
              <div className="text-xs text-slate-500 mt-1">Total Stock In</div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 text-center">
              <div className="text-2xl font-bold text-red-600">-{totalOut}</div>
              <div className="text-xs text-slate-500 mt-1">Total Stock Out</div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search model..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Model</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Size</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Opening</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-green-600 uppercase">Stock In (+)</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-red-500 uppercase">Stock Out (−)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Closing</th>
                    <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase text-center">History</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const realIdx = rows.findIndex((r) => r.sku_id === row.sku_id);
                    const showInDetail = row.stock_in > 0;
                    const showOutDetail = row.stock_out > 0;
                    return (
                      <>
                        <tr key={row.sku_id} className={`border-t border-slate-50 ${row.changed ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{row.brand} {row.model_code}</div>
                            <div className="text-xs text-slate-500">{row.color_code} · {row.frame_type}</div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{row.size}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{row.opening_qty}</td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number" min="0"
                              value={row.stock_in || ''}
                              onChange={(e) => updateRow(realIdx, 'stock_in', e.target.value)}
                              placeholder="0"
                              className="w-16 mx-auto block text-center px-2 py-1.5 border border-green-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1 justify-center">
                              <input
                                type="number" min="0"
                                value={row.stock_out || ''}
                                onChange={(e) => updateRow(realIdx, 'stock_out', e.target.value)}
                                placeholder="0"
                                className="w-16 block text-center px-2 py-1.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-red-50"
                              />
                              <button
                                onClick={() => openExchange(row)}
                                title="Exchange"
                                className="p-1 rounded-lg hover:bg-orange-100 text-orange-500"
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold ${row.closing_qty < 0 ? 'text-red-700' : row.closing_qty !== row.opening_qty ? 'text-blue-700' : 'text-slate-700'}`}>
                              {row.closing_qty}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button onClick={() => openSkuHistory(row)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                              <History size={13} />
                            </button>
                          </td>
                        </tr>

                        {/* Stock In detail row */}
                        {showInDetail && (
                          <tr key={`${row.sku_id}_in`} className="bg-green-50/80 border-t border-green-100">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-green-700 whitespace-nowrap">Stock In — Remarks:</span>
                                <input
                                  value={row.stock_in_remarks}
                                  onChange={(e) => updateRowField(realIdx, 'stock_in_remarks', e.target.value)}
                                  placeholder="Optional remarks (e.g. restock, return)"
                                  className="flex-1 px-2 py-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400 bg-white"
                                />
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Stock Out detail row */}
                        {showOutDetail && (
                          <tr key={`${row.sku_id}_out`} className="bg-red-50/80 border-t border-red-100">
                            <td colSpan={7} className="px-4 py-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-red-700 whitespace-nowrap">Stock Out — Reason <span className="text-red-500">*</span>:</span>
                                <div className="relative">
                                  <select
                                    value={row.stock_out_reason}
                                    onChange={(e) => updateRowField(realIdx, 'stock_out_reason', e.target.value)}
                                    className={`pl-2 pr-6 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-400 bg-white appearance-none ${!row.stock_out_reason ? 'border-red-400 text-red-400' : 'border-slate-300 text-slate-700'}`}
                                  >
                                    <option value="">Select reason...</option>
                                    {OUT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                  <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                </div>
                                <input
                                  value={row.reference_number}
                                  onChange={(e) => updateRowField(realIdx, 'reference_number', e.target.value)}
                                  placeholder="Reference No. (optional)"
                                  className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-red-400 bg-white w-44"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any remarks for today..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={saving || changedCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={14} />
                {saving ? 'Submitting...' : `Submit Adjustment (${changedCount} items)`}
              </button>
            </div>
          </div>
        </>
      )}

      {/* SKU Movement History Modal */}
      <Modal open={!!historyRow} onClose={() => setHistoryRow(null)} title={historyRow ? `${historyRow.brand} ${historyRow.model_code}-${historyRow.color_code} History` : ''} size="lg">
        {movLoading ? <LoadingSpinner /> : (
          <div>
            <div className="text-xs text-slate-500 mb-3">Showing last 50 movements for this SKU at {outletCode}</div>
            {skuMovements.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No movement history yet.</div>
            ) : (
              <div className="overflow-auto max-h-96">
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
                        <td className="px-3 py-2 text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${m.movement_type === 'in' || m.movement_type === 'transfer_in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {m.movement_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${m.movement_type.includes('in') ? 'text-green-600' : 'text-red-600'}`}>
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
          </div>
        )}
      </Modal>

      {/* Exchange Modal */}
      <Modal open={!!exchangeSourceRow} onClose={() => setExchangeSourceRow(null)} title="Exchange Frame" size="md">
        {exchangeSourceRow && (
          <div className="space-y-4">
            <div className="bg-red-50 rounded-lg p-3 text-sm">
              <div className="text-xs text-slate-500 mb-1">Frame going OUT (given to customer):</div>
              <div className="font-semibold text-slate-800">{exchangeSourceRow.brand} {exchangeSourceRow.model_code} — {exchangeSourceRow.color_code} (Sz {exchangeSourceRow.size})</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference Number (optional)</label>
              <input
                value={exchangeRef}
                onChange={(e) => setExchangeRef(e.target.value)}
                placeholder="e.g. EX-001"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Frame coming IN (returned by customer):</label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={exchangeSearch}
                  onChange={(e) => setExchangeSearch(e.target.value)}
                  placeholder="Search frame to exchange in..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-50">
                {exchangeFiltered.slice(0, 20).map((r) => (
                  <button
                    key={r.sku_id}
                    onClick={() => applyExchange(r)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 text-sm"
                  >
                    <span className="font-medium text-slate-800">{r.brand} {r.model_code}</span>
                    <span className="text-slate-500 ml-2 text-xs">{r.color_code} · Sz {r.size} · Qty: {r.opening_qty}</span>
                  </button>
                ))}
                {exchangeFiltered.length === 0 && (
                  <div className="px-3 py-4 text-center text-slate-400 text-sm">No frames found.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
