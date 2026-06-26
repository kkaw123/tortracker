import { useEffect, useState } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateInvoiceNumber, formatCurrency } from '../../lib/utils';

interface PLTStock {
  balance_id: string;
  sku_id: string;
  fm_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  frame_type: string;
  quantity: number;
  plt_cost: number;
  plt_selling: number;
}

interface TransferLine {
  sku_id: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  available_qty: number;
  qty: number;
  plt_cost: number;
  plt_selling: number;
  outlet_cost: number;
  outlet_selling: number;
}

interface Props {
  pltOutlet: { id: string; code: string };
  onCreated: () => void;
  onCancel: () => void;
}

const RETAIL_OUTLETS = [
  { code: 'SS2', name: 'SS2 Outlet' },
  { code: 'KD', name: 'Kota Damansara' },
  { code: 'CHR', name: 'Cheras Outlet' },
];

export default function CreateTransfer({ pltOutlet, onCreated, onCancel }: Props) {
  const { user } = useAuth();
  const [toOutletCode, setToOutletCode] = useState<string>('SS2');
  const [toOutlet, setToOutlet] = useState<{ id: string; code: string } | null>(null);
  const [pltStock, setPltStock] = useState<PLTStock[]>([]);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  useEffect(() => { fetchPLTStock(); }, []);
  useEffect(() => {
    supabase.from('outlets').select('*').eq('code', toOutletCode).single().then(({ data }) => {
      setToOutlet(data);
    });
  }, [toOutletCode]);

  async function fetchPLTStock() {
    const { data: balances } = await supabase
      .from('stock_balance')
      .select(`id, quantity, sku_id, skus!inner(id, color_code, size, frame_model_id, plt_cost_price, plt_selling_price, frame_models!inner(id, brand, model_code, frame_type))`)
      .eq('outlet_id', pltOutlet.id)
      .gt('quantity', 0);

    const rows: PLTStock[] = (balances ?? []).map((b: any) => ({
      balance_id: b.id,
      sku_id: b.sku_id,
      fm_id: b.skus?.frame_models?.id ?? '',
      brand: b.skus?.frame_models?.brand ?? '',
      model_code: b.skus?.frame_models?.model_code ?? '',
      color_code: b.skus?.color_code ?? '',
      size: b.skus?.size ?? '',
      frame_type: b.skus?.frame_models?.frame_type ?? '',
      quantity: b.quantity,
      plt_cost: b.skus?.plt_cost_price ?? 0,
      plt_selling: b.skus?.plt_selling_price ?? 0,
    }));
    setPltStock(rows.sort((a, b) => a.model_code.localeCompare(b.model_code)));
  }

  function addLine(stock: PLTStock) {
    if (lines.some((l) => l.sku_id === stock.sku_id)) return;
    setLines((prev) => [...prev, {
      sku_id: stock.sku_id,
      brand: stock.brand,
      model_code: stock.model_code,
      color_code: stock.color_code,
      size: stock.size,
      available_qty: stock.quantity,
      qty: 1,
      plt_cost: stock.plt_cost,
      plt_selling: stock.plt_selling,
      outlet_cost: stock.plt_selling, // default outlet cost = plt selling price
      outlet_selling: 0,
    }]);
    setAddSearch('');
  }

  function removeLine(sku_id: string) {
    setLines((prev) => prev.filter((l) => l.sku_id !== sku_id));
  }

  function updateLine(sku_id: string, field: keyof TransferLine, val: string | number) {
    setLines((prev) => prev.map((l) => l.sku_id === sku_id ? { ...l, [field]: Number(val) || val } : l));
  }

  const filteredStock = pltStock
    .filter((s) => !lines.some((l) => l.sku_id === s.sku_id))
    .filter((s) => !addSearch || `${s.brand} ${s.model_code} ${s.color_code}`.toLowerCase().includes(addSearch.toLowerCase()));

  async function handleCreate() {
    if (!user || !toOutlet) return;
    const validLines = lines.filter((l) => l.qty > 0 && l.qty <= l.available_qty);
    if (validLines.length === 0) {
      alert('Please add at least one item with valid quantity.');
      return;
    }
    setSaving(true);
    try {
      const invoiceNo = generateInvoiceNumber();
      const { data: transfer, error: tErr } = await supabase
        .from('transfers')
        .insert({
          from_outlet_id: pltOutlet.id,
          to_outlet_id: toOutlet.id,
          status: 'pending_confirmation',
          invoice_number: invoiceNo,
          notes,
          created_by: user.name,
        })
        .select()
        .single();
      if (tErr) throw new Error(tErr.message);

      const items = validLines.map((l) => ({
        transfer_id: transfer.id,
        sku_id: l.sku_id,
        quantity: l.qty,
        plt_cost_price: l.plt_cost,
        outlet_cost_price: l.outlet_cost,
        plt_selling_price: l.plt_selling,
        outlet_selling_price: l.outlet_selling,
      }));
      await supabase.from('transfer_items').insert(items);

      // Deduct from PLT stock
      for (const l of validLines) {
        const pltItem = pltStock.find((s) => s.sku_id === l.sku_id);
        if (pltItem) {
          await supabase.from('stock_balance')
            .update({ quantity: pltItem.quantity - l.qty })
            .eq('id', pltItem.balance_id);
          await supabase.from('stock_movements').insert({
            outlet_id: pltOutlet.id, sku_id: l.sku_id, movement_type: 'transfer_out',
            quantity: l.qty, reference_id: transfer.id, notes: `Transfer to ${toOutletCode}`, created_by: user.name,
          });
        }
      }

      alert(`Transfer ${invoiceNo} created successfully!`);
      onCreated();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Destination */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Transfer To</label>
          <select
            value={toOutletCode}
            onChange={(e) => setToOutletCode(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {RETAIL_OUTLETS.map((o) => (
              <option key={o.code} value={o.code}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Add items search */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Add Items from PLT Stock</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            placeholder="Search brand, model, color..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {addSearch && (
          <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow-lg max-h-48 overflow-y-auto bg-white z-10">
            {filteredStock.slice(0, 20).map((s) => (
              <button
                key={s.sku_id}
                onClick={() => addLine(s)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 text-left text-sm"
              >
                <div>
                  <span className="font-medium">{s.brand} {s.model_code}-{s.color_code}</span>
                  <span className="text-slate-500 ml-2">Sz {s.size} · {s.frame_type}</span>
                </div>
                <span className="text-slate-600 font-semibold">Avail: {s.quantity}</span>
              </button>
            ))}
            {filteredStock.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No items found.</div>}
          </div>
        )}
      </div>

      {/* Transfer lines */}
      {lines.length > 0 ? (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">Item</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">Size</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500">Avail</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-blue-600">Transfer Qty</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">PLT Cost</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">Outlet Cost</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">Outlet Sell</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.sku_id} className={l.qty > l.available_qty ? 'bg-red-50' : ''}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{l.brand} {l.model_code}</div>
                    <div className="text-xs text-slate-500">{l.color_code}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{l.size}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{l.available_qty}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="1"
                      max={l.available_qty}
                      value={l.qty}
                      onChange={(e) => updateLine(l.sku_id, 'qty', e.target.value)}
                      className={`w-16 text-center mx-auto block px-2 py-1 border rounded text-sm focus:outline-none ${l.qty > l.available_qty ? 'border-red-400 bg-red-50' : 'border-blue-300 bg-blue-50'}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(l.plt_cost)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={l.outlet_cost}
                      onChange={(e) => updateLine(l.sku_id, 'outlet_cost', e.target.value)}
                      className="w-24 text-right ml-auto block px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={l.outlet_selling}
                      onChange={(e) => updateLine(l.sku_id, 'outlet_selling', e.target.value)}
                      className="w-24 text-right ml-auto block px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeLine(l.sku_id)} className="text-red-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={3} className="px-3 py-2.5 text-sm font-semibold text-slate-600">Total</td>
                <td className="px-3 py-2.5 text-center font-bold text-blue-700">{lines.reduce((s, l) => s + l.qty, 0)}</td>
                <td colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <Plus size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Search and add items above to create a transfer</p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        <button
          onClick={handleCreate}
          disabled={saving || lines.length === 0}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating...' : `Create Transfer (${lines.length} items)`}
        </button>
      </div>
    </div>
  );
}
