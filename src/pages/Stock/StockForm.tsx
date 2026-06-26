import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FRAME_TYPES, CATEGORIES } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  outlet: { id: string; code: string; name: string };
  editData?: any;
  onSaved: () => void;
  onCancel: () => void;
}

export default function StockForm({ outlet, editData, onSaved, onCancel }: Props) {
  useAuth();
  const isEdit = !!editData;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [brand, setBrand] = useState(editData?.brand ?? '');
  const [modelCode, setModelCode] = useState(editData?.model_code ?? '');
  const [colorCode, setColorCode] = useState(editData?.color_code ?? '');
  const [size, setSize] = useState(editData?.size ?? '');
  const [frameType, setFrameType] = useState(editData?.frame_type ?? 'Plastic');
  const [category, setCategory] = useState(editData?.category ?? 'Frame');
  const [quantity, setQuantity] = useState(String(editData?.quantity ?? 0));
  const [threshold, setThreshold] = useState(String(editData?.low_stock_threshold ?? 5));
  const [costPrice, setCostPrice] = useState(String(editData?.cost_price ?? 0));
  const [sellingPrice, setSellingPrice] = useState(String(editData?.selling_price ?? 0));
  const [supplierName, setSupplierName] = useState(editData?.supplier_name !== '-' ? editData?.supplier_name ?? '' : '');

  async function handleSave() {
    setError('');
    if (!brand || !modelCode || !colorCode || !size) {
      setError('Please fill in all required fields: Brand, Model Code, Color, Size.');
      return;
    }
    setSaving(true);
    try {
      // Handle supplier
      let supplierId: string | null = null;
      if (supplierName.trim()) {
        const { data: sup } = await supabase
          .from('suppliers')
          .upsert({ name: supplierName.trim(), contact: '' }, { onConflict: 'name' })
          .select()
          .single();
        supplierId = sup?.id ?? null;
      }

      // Upsert frame model
      const { data: fm, error: fmErr } = await supabase
        .from('frame_models')
        .upsert({
          ...(isEdit ? { id: editData?.fm_id } : {}),
          brand: brand.trim(),
          model_code: modelCode.trim().toUpperCase(),
          frame_type: frameType,
          category,
          supplier_id: supplierId,
          notes: '',
        }, { onConflict: 'model_code' })
        .select()
        .single();
      if (fmErr) throw new Error(fmErr.message);

      // Upsert SKU
      const { data: sku, error: skuErr } = await supabase
        .from('skus')
        .upsert({
          ...(isEdit ? { id: editData?.sku_id } : {}),
          frame_model_id: fm.id,
          color_code: colorCode.trim().toUpperCase(),
          size: size.trim(),
          plt_cost_price: outlet.code === 'PLT' ? Number(costPrice) : 0,
          plt_selling_price: outlet.code === 'PLT' ? Number(sellingPrice) : 0,
        }, { onConflict: 'frame_model_id,color_code,size' })
        .select()
        .single();
      if (skuErr) throw new Error(skuErr.message);

      // Upsert stock balance
      const { error: balErr } = await supabase
        .from('stock_balance')
        .upsert({
          ...(isEdit ? { id: editData?.balance_id } : {}),
          outlet_id: outlet.id,
          sku_id: sku.id,
          quantity: Number(quantity),
          low_stock_threshold: Number(threshold),
        }, { onConflict: 'outlet_id,sku_id' });
      if (balErr) throw new Error(balErr.message);

      // Upsert outlet price
      await supabase.from('outlet_sku_prices').upsert({
        sku_id: sku.id,
        outlet_id: outlet.id,
        cost_price: Number(costPrice),
        selling_price: Number(sellingPrice),
      }, { onConflict: 'sku_id,outlet_id' });

      // Check low stock and create alert
      if (Number(quantity) <= Number(threshold)) {
        await supabase.from('alerts').upsert({
          outlet_id: outlet.id,
          sku_id: sku.id,
          alert_type: 'low_stock',
          message: `Low stock: ${brand} ${modelCode}-${colorCode} (Size ${size}) — Qty: ${quantity}`,
          is_read: false,
        }, { onConflict: 'outlet_id,sku_id,alert_type' });
      }

      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const input = (label: string, value: string, onChange: (v: string) => void, required = false, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        {input('Brand', brand, setBrand, true)}
        {input('Model Code', modelCode, setModelCode, true)}
        {input('Color Code', colorCode, setColorCode, true)}
        {input('Frame Size (e.g. 50)', size, setSize, true)}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Frame Type <span className="text-red-500">*</span></label>
          <select value={frameType} onChange={(e) => setFrameType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {FRAME_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Category <span className="text-red-500">*</span></label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {input('Quantity', quantity, setQuantity, true, 'number')}
        {input('Low Stock Threshold', threshold, setThreshold, true, 'number')}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {input('Cost Price (RM)', costPrice, setCostPrice, false, 'number')}
        {input('Selling Price (RM)', sellingPrice, setSellingPrice, false, 'number')}
      </div>

      {input('Supplier Name', supplierName, setSupplierName)}

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Item' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}
