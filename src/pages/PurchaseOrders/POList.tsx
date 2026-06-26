import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Upload, FileText, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, formatCurrency } from '../../lib/utils';
import Modal from '../../components/Common/Modal';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import POForm from './POForm';

interface PORow {
  id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  discount_amount: number | null;
  payment_date: string | null;
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
  const outletCode = outletId?.toUpperCase();
  const isPLT = outletCode === 'PLT';

  const [outlet, setOutlet] = useState<{ id: string; code: string } | null>(null);
  const [pos, setPOs] = useState<PORow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [paymentPO, setPaymentPO] = useState<PORow | null>(null);
  const [payAmt, setPayAmt] = useState('');
  const [discAmt, setDiscAmt] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payErr, setPayErr] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => { fetchData(); }, [outletId]);

  async function fetchData() {
    setLoading(true);
    const code = outletId?.toUpperCase();
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', code).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    const { data } = await supabase
      .from('purchase_orders')
      .select(`id, po_number, status, payment_status, payment_amount, discount_amount, payment_date,
        do_document_url, notes, created_by, created_at,
        suppliers!inner(name),
        purchase_order_items(quantity, cost_price)`)
      .eq('outlet_id', outletData.id)
      .order('created_at', { ascending: false });

    setPOs((data ?? []).map((p: any) => ({
      id: p.id,
      po_number: p.po_number,
      supplier_name: p.suppliers?.name ?? '-',
      status: p.status,
      payment_status: p.payment_status ?? 'unpaid',
      payment_amount: p.payment_amount ?? null,
      discount_amount: p.discount_amount ?? null,
      payment_date: p.payment_date ?? null,
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

  function openPaymentModal(po: PORow) {
    setPaymentPO(po);
    setPayAmt('');
    setDiscAmt('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayErr('');
  }

  async function handleMarkPaid() {
    if (!paymentPO) return;
    const pay = Number(payAmt) || 0;
    const disc = Number(discAmt) || 0;
    const total = paymentPO.total_value;
    if (Math.abs((pay + disc) - total) > 0.01) {
      setPayErr(`Payment (${formatCurrency(pay)}) + Discount (${formatCurrency(disc)}) must equal Invoice Total (${formatCurrency(total)})`);
      return;
    }
    setPaying(true);
    await supabase.from('purchase_orders').update({
      payment_status: 'paid',
      payment_amount: pay,
      discount_amount: disc,
      payment_date: payDate,
    }).eq('id', paymentPO.id);
    setPaying(false);
    setPaymentPO(null);
    fetchData();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {isPLT ? 'Purchase Orders' : 'Purchase Order History'}
          </h2>
          <p className="text-sm text-slate-500">{pos.length} records · {outletCode}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus size={14} /> New Invoice
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Supplier</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Payment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Items</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice Total</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ref. Doc</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Created By</th>
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
                    {po.payment_status === 'paid' ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          <CheckCircle size={10} /> Paid
                        </span>
                        {po.payment_date && <span className="text-xs text-slate-400">{po.payment_date}</span>}
                      </div>
                    ) : (
                      <button
                        onClick={() => openPaymentModal(po)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full hover:bg-red-200 transition-colors"
                      >
                        <Clock size={10} /> Unpaid
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{po.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold">{po.total_qty}</td>
                  <td className="px-4 py-3 text-right text-slate-700 font-semibold">{formatCurrency(po.total_value)}</td>
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
                  <td className="px-4 py-3 text-center text-xs text-slate-500">{po.created_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Invoice Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Purchase Invoice" size="xl">
        {outlet && <POForm outlet={outlet} onSaved={() => { setShowForm(false); fetchData(); }} onCancel={() => setShowForm(false)} />}
      </Modal>

      {/* Mark as Paid Modal */}
      <Modal open={!!paymentPO} onClose={() => setPaymentPO(null)} title="Mark Invoice as Paid" size="md">
        {paymentPO && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="font-semibold text-slate-800">{paymentPO.po_number}</div>
              <div className="text-slate-600">{paymentPO.supplier_name}</div>
              <div className="text-lg font-bold text-slate-900 mt-1">Invoice Total: {formatCurrency(paymentPO.total_value)}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payment Amount (RM) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmt}
                  onChange={(e) => { setPayAmt(e.target.value); setPayErr(''); }}
                  placeholder="e.g. 800.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount / Rebate (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  value={discAmt}
                  onChange={(e) => { setDiscAmt(e.target.value); setPayErr(''); }}
                  placeholder="e.g. 200.00"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {payAmt && (
              <div className={`text-sm px-3 py-2 rounded-lg ${Math.abs((Number(payAmt || 0) + Number(discAmt || 0)) - paymentPO.total_value) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                Payment + Discount = {formatCurrency(Number(payAmt || 0) + Number(discAmt || 0))}
                {Math.abs((Number(payAmt || 0) + Number(discAmt || 0)) - paymentPO.total_value) < 0.01
                  ? ' ✓ Matches invoice total'
                  : ` (Need ${formatCurrency(paymentPO.total_value)})`}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {payErr && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{payErr}</div>}

            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setPaymentPO(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={handleMarkPaid}
                disabled={paying || !payAmt || !payDate}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {paying ? 'Saving...' : 'Mark as Paid'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
