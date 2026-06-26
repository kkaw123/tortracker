import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Save, History, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../lib/utils';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { OutletCode } from '../../types';

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

  useEffect(() => { fetchData(); }, [outletId]);
  useEffect(() => { if (view === 'history') fetchHistory(); }, [view]);

  async function fetchData() {
    setLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', outletCode).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    // Check if already submitted today
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

  function updateRow(idx: number, field: 'stock_in' | 'stock_out', val: string) {
    setRows((prev) => {
      const updated = [...prev];
      const r = { ...updated[idx] };
      r[field] = Math.max(0, Number(val) || 0);
      r.closing_qty = r.opening_qty + r.stock_in - r.stock_out;
      r.changed = r.stock_in !== 0 || r.stock_out !== 0;
      updated[idx] = r;
      return updated;
    });
  }

  async function handleSubmit() {
    if (!outlet || !user) return;
    const changedRows = rows.filter((r) => r.changed);
    if (changedRows.length === 0) {
      alert('No changes recorded. Please enter at least one stock in or out value.');
      return;
    }
    setSaving(true);
    try {
      // Create adjustment record
      const { data: adj, error: adjErr } = await supabase
        .from('daily_adjustments')
        .insert({ outlet_id: outlet.id, date: today, submitted_by: user.name, notes })
        .select()
        .single();
      if (adjErr) throw new Error(adjErr.message);

      // Insert items
      const adjItems = changedRows.map((r) => ({
        adjustment_id: adj.id,
        sku_id: r.sku_id,
        opening_qty: r.opening_qty,
        stock_in: r.stock_in,
        stock_out: r.stock_out,
        closing_qty: r.closing_qty,
      }));
      await supabase.from('daily_adjustment_items').insert(adjItems);

      // Update stock balances
      for (const r of changedRows) {
        await supabase
          .from('stock_balance')
          .update({ quantity: r.closing_qty, updated_at: new Date().toISOString() })
          .eq('id', r.balance_id);

        // Log movement
        if (r.stock_in > 0) {
          await supabase.from('stock_movements').insert({
            outlet_id: outlet.id, sku_id: r.sku_id, movement_type: 'in',
            quantity: r.stock_in, reference_id: adj.id, notes: 'Daily adjustment', created_by: user.name,
          });
        }
        if (r.stock_out > 0) {
          await supabase.from('stock_movements').insert({
            outlet_id: outlet.id, sku_id: r.sku_id, movement_type: 'out',
            quantity: r.stock_out, reference_id: adj.id, notes: 'Daily adjustment', created_by: user.name,
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
  const changedCount = rows.filter((r) => r.changed).length;
  const totalIn = rows.reduce((s, r) => s + r.stock_in, 0);
  const totalOut = rows.reduce((s, r) => s + r.stock_out, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* Header tabs */}
      <div className="flex items-center justify-between">
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

          {/* Summary bar */}
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

          {/* Search */}
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

          {/* Adjustment table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Model</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Size</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Opening</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-green-600 uppercase">Stock In (+)</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase">Stock Out (-)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((row) => {
                    const realIdx = rows.findIndex((r) => r.sku_id === row.sku_id);
                    return (
                      <tr key={row.sku_id} className={`${row.changed ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-2.5" data-idx={realIdx}>
                          <div className="font-medium text-slate-800">{row.brand} {row.model_code}</div>
                          <div className="text-xs text-slate-500">{row.color_code}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{row.size}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{row.frame_type}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{row.opening_qty}</td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={row.stock_in || ''}
                            onChange={(e) => updateRow(realIdx, 'stock_in', e.target.value)}
                            placeholder="0"
                            className="w-20 mx-auto block text-center px-2 py-1.5 border border-green-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-green-50"
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            type="number"
                            min="0"
                            value={row.stock_out || ''}
                            onChange={(e) => updateRow(realIdx, 'stock_out', e.target.value)}
                            placeholder="0"
                            className="w-20 mx-auto block text-center px-2 py-1.5 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-red-50"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`font-bold ${row.closing_qty < 0 ? 'text-red-700' : row.closing_qty !== row.opening_qty ? 'text-blue-700' : 'text-slate-700'}`}>
                            {row.closing_qty}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes & Submit */}
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
    </div>
  );
}
