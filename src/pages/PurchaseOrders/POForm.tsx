import { useEffect, useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateRefNumber } from '../../lib/utils';

interface Props {
  outlet: { id: string; code: string };
  onSaved: () => void;
  onCancel: () => void;
}

interface SKUOption { sku_id: string; label: string; }
interface POLine { sku_id: string; label: string; quantity: number; cost_price: number; }

export default function POForm({ outlet, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<POLine[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuOptions, setSkuOptions] = useState<SKUOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('suppliers').select('id, name').then(({ data }) => setSuppliers(data ?? []));
    supabase.from('skus').select(`id, color_code, size, frame_models!inner(brand, model_code)`)
      .then(({ data }) => setSkuOptions((data ?? []).map((s: any) => ({
        sku_id: s.id,
        label: `${s.frame_models?.brand} ${s.frame_models?.model_code}-${s.color_code} (Sz ${s.size})`,
      }))));
  }, []);

  function addLine(sku: SKUOption) {
    if (lines.some((l) => l.sku_id === sku.sku_id)) return;
    setLines((prev) => [...prev, { sku_id: sku.sku_id, label: sku.label, quantity: 1, cost_price: 0 }]);
    setSkuSearch('');
  }

  const filteredSkus = skuOptions.filter((s) => !lines.some((l) => l.sku_id === s.sku_id) && s.label.toLowerCase().includes(skuSearch.toLowerCase()));

  async function handleSave() {
    if (!lines.length) { alert('Add at least one item.'); return; }
    setSaving(true);
    try {
      let finalSupplierId = supplierId;
      if (!finalSupplierId && newSupplier.trim()) {
        const { data: sup } = await supabase.from('suppliers')
          .upsert({ name: newSupplier.trim(), contact: '' }, { onConflict: 'name' })
          .select().single();
        finalSupplierId = sup?.id ?? '';
      }
      if (!finalSupplierId) { alert('Please select or enter a supplier.'); setSaving(false); return; }

      const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
        outlet_id: outlet.id, supplier_id: finalSupplierId,
        status: 'pending', notes, po_number: generateRefNumber('PO'), created_by: user?.name,
      }).select().single();
      if (poErr) throw new Error(poErr.message);

      await supabase.from('purchase_order_items').insert(
        lines.map((l) => ({ po_id: po.id, sku_id: l.sku_id, quantity: l.quantity, cost_price: l.cost_price }))
      );
      onSaved();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">-- Select supplier --</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!supplierId && (
            <input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Or type new supplier name..." className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Add Items</label>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={skuSearch} onChange={(e) => setSkuSearch(e.target.value)} placeholder="Search model..." className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        {skuSearch && (
          <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow max-h-40 overflow-y-auto bg-white">
            {filteredSkus.slice(0, 15).map((s) => (
              <button key={s.sku_id} onClick={() => addLine(s)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm">{s.label}</button>
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500">Item</th>
                <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-500">Qty</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500">Cost Price</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.sku_id}>
                  <td className="px-3 py-2 text-sm text-slate-700">{l.label}</td>
                  <td className="px-3 py-2">
                    <input type="number" min="1" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((ll) => ll.sku_id === l.sku_id ? { ...ll, quantity: Number(e.target.value) } : ll))}
                      className="w-16 text-center mx-auto block px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={l.cost_price} onChange={(e) => setLines((prev) => prev.map((ll) => ll.sku_id === l.sku_id ? { ...ll, cost_price: Number(e.target.value) } : ll))}
                      className="w-24 text-right ml-auto block px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setLines((prev) => prev.filter((ll) => ll.sku_id !== l.sku_id))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Create PO'}
        </button>
      </div>
    </div>
  );
}
