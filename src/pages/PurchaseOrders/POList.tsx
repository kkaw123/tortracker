import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Eye, Upload, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, STATUS_COLORS, formatCurrency } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import Modal from '../../components/Common/Modal';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import POForm from './POForm';

interface PORow {
  id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  do_document_url: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  item_count: number;
  total_qty: number;
  total_value: number;
}

export default function POList() {
  const { outletId } = useParams<{ outletId: string }>();
  useAuth();

  const [outlet, setOutlet] = useState<{ id: string; code: string } | null>(null);
  const [pos, setPOs] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { fetchData(); }, [outletId]);

  async function fetchData() {
    setLoading(true);
    const code = outletId?.toUpperCase();
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', code).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    const { data } = await supabase
      .from('purchase_orders')
      .select(`id, po_number, status, do_document_url, notes, created_by, created_at,
        suppliers!inner(name),
        purchase_order_items(quantity, cost_price)`)
      .eq('outlet_id', outletData.id)
      .order('created_at', { ascending: false });

    setPOs((data ?? []).map((p: any) => ({
      id: p.id,
      po_number: p.po_number,
      supplier_name: p.suppliers?.name ?? '-',
      status: p.status,
      do_document_url: p.do_document_url,
      notes: p.notes,
      created_by: p.created_by,
      created_at: p.created_at,
      item_count: p.purchase_order_items?.length ?? 0,
      total_qty: (p.purchase_order_items ?? []).reduce((s: number, i: any) => s + i.quantity, 0),
      total_value: (p.purchase_order_items ?? []).reduce((s: number, i: any) => s + i.quantity * i.cost_price, 0),
    })));
    setLoading(false);
  }

  async function handleDOUpload(poId: string, file: File) {
    const fileName = `DO_${poId}_${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from('do-documents')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (error) { alert('Upload failed: ' + error.message); return; }
    const { data: urlData } = supabase.storage.from('do-documents').getPublicUrl(fileName);
    await supabase.from('purchase_orders').update({ do_document_url: urlData.publicUrl }).eq('id', poId);
    fetchData();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Purchase Orders</h2>
          <p className="text-sm text-slate-500">{pos.length} records · {outletId?.toUpperCase()}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={14} /> New PO
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">PO Number</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Supplier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Items</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Value</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">DO Doc</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pos.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">No purchase orders yet.</td></tr>
              ) : pos.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-700">{po.po_number}</td>
                  <td className="px-4 py-3 text-slate-700">{po.supplier_name}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge label={po.status.charAt(0).toUpperCase() + po.status.slice(1)} className={STATUS_COLORS[po.status] ?? 'bg-slate-100 text-slate-700'} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{po.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold">{po.total_qty}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(po.total_value)}</td>
                  <td className="px-4 py-3 text-center">
                    {po.do_document_url ? (
                      <a href={po.do_document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center justify-center gap-1">
                        <FileText size={12} /> View
                      </a>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          id={`do-${po.id}`}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleDOUpload(po.id, f);
                          }}
                        />
                        <label htmlFor={`do-${po.id}`} className="flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-blue-600 cursor-pointer">
                          <Upload size={12} /> Upload
                        </label>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(po.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={po.id}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Purchase Order" size="xl">
        {outlet && <POForm outlet={outlet} onSaved={() => { setShowForm(false); fetchData(); }} onCancel={() => setShowForm(false)} />}
      </Modal>
    </div>
  );
}
