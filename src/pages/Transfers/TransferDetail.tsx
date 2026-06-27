import { useEffect, useState } from 'react';
import { CheckCircle, Printer, X, AlertTriangle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, formatCurrency, STATUS_COLORS, OUTLET_COLORS } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { OutletCode, TransferStatus } from '../../types';

interface TransferFull {
  id: string;
  invoice_number: string;
  status: TransferStatus;
  from_code: string;
  to_code: string;
  to_name: string;
  notes: string;
  dispute_notes: string;
  created_by: string;
  created_at: string;
  plt_stock_deducted: boolean;
  items: {
    sku_id: string;
    brand: string;
    model_code: string;
    color_code: string;
    size: string;
    quantity: number;
    plt_cost_price: number;
    outlet_cost_price: number;
    plt_selling_price: number;
    outlet_selling_price: number;
  }[];
}

interface Props {
  transferId: string;
  outletCode: OutletCode;
  onUpdated: () => void;
}

export default function TransferDetail({ transferId, outletCode, onUpdated }: Props) {
  const { user } = useAuth();
  const [transfer, setTransfer] = useState<TransferFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [receiptModal, setReceiptModal] = useState<'confirm' | 'dispute' | null>(null);
  const [disputeText, setDisputeText] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  useEffect(() => { fetchTransfer(); }, [transferId]);

  async function fetchTransfer() {
    setLoading(true);
    const { data } = await supabase
      .from('transfers')
      .select(`
        id, invoice_number, status, notes, dispute_notes, created_by, created_at, plt_stock_deducted,
        from_outlet:outlets!transfers_from_outlet_id_fkey(code),
        to_outlet:outlets!transfers_to_outlet_id_fkey(code, name),
        transfer_items(sku_id, quantity, plt_cost_price, outlet_cost_price, plt_selling_price, outlet_selling_price,
          skus!inner(color_code, size, frame_models!inner(brand, model_code)))
      `)
      .eq('id', transferId)
      .single();

    if (!data) { setLoading(false); return; }
    setTransfer({
      id: data.id,
      invoice_number: data.invoice_number,
      status: data.status,
      from_code: (data as any).from_outlet?.code ?? '',
      to_code: (data as any).to_outlet?.code ?? '',
      to_name: (data as any).to_outlet?.name ?? '',
      notes: data.notes ?? '',
      dispute_notes: (data as any).dispute_notes ?? '',
      created_by: data.created_by,
      created_at: data.created_at,
      plt_stock_deducted: (data as any).plt_stock_deducted ?? true,
      items: ((data as any).transfer_items ?? []).map((i: any) => ({
        sku_id: i.sku_id,
        brand: i.skus?.frame_models?.brand ?? '',
        model_code: i.skus?.frame_models?.model_code ?? '',
        color_code: i.skus?.color_code ?? '',
        size: i.skus?.size ?? '',
        quantity: i.quantity,
        plt_cost_price: i.plt_cost_price,
        outlet_cost_price: i.outlet_cost_price,
        plt_selling_price: i.plt_selling_price,
        outlet_selling_price: i.outlet_selling_price,
      })),
    });
    setLoading(false);
  }

  async function confirmDelivered() {
    if (!transfer || !user) return;
    setActing(true);
    await supabase.from('transfers').update({ status: 'delivered', confirmed_at: new Date().toISOString() }).eq('id', transfer.id);
    setActing(false);
    onUpdated();
  }

  async function handleOrderReceived() {
    if (!transfer || !user) return;
    setActing(true);
    try {
      // Guard against double-receipt
      const { data: current } = await supabase.from('transfers').select('status').eq('id', transfer.id).single();
      if (current?.status === 'received') {
        alert('This transfer has already been marked as received.');
        setActing(false);
        onUpdated();
        return;
      }

      await supabase.from('transfers').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', transfer.id);

      // Add stock to receiving outlet
      const { data: toOutletData } = await supabase.from('outlets').select('id').eq('code', transfer.to_code).single();
      if (!toOutletData) throw new Error('Outlet not found');

      for (const item of transfer.items) {
        const { data: existing } = await supabase.from('stock_balance')
          .select('id, quantity').eq('outlet_id', toOutletData.id).eq('sku_id', item.sku_id).single();

        if (existing) {
          await supabase.from('stock_balance')
            .update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
        } else {
          await supabase.from('stock_balance').insert({
            outlet_id: toOutletData.id, sku_id: item.sku_id, quantity: item.quantity, low_stock_threshold: 5,
          });
        }

        await supabase.from('outlet_sku_prices').upsert({
          sku_id: item.sku_id, outlet_id: toOutletData.id,
          cost_price: item.outlet_cost_price, selling_price: item.outlet_selling_price,
        }, { onConflict: 'sku_id,outlet_id' });

        await supabase.from('stock_movements').insert({
          outlet_id: toOutletData.id, sku_id: item.sku_id, movement_type: 'transfer_in',
          quantity: item.quantity, reference_id: transfer.id,
          notes: `Received from PLT — ${transfer.invoice_number}`, created_by: user.name,
        });
      }

      // If PLT stock not yet deducted (new flow), deduct now at receipt
      if (!transfer.plt_stock_deducted) {
        const { data: fromOutletData } = await supabase.from('outlets').select('id').eq('code', 'PLT').single();
        if (fromOutletData) {
          for (const item of transfer.items) {
            const { data: pltBal } = await supabase.from('stock_balance')
              .select('id, quantity').eq('outlet_id', fromOutletData.id).eq('sku_id', item.sku_id).single();
            if (pltBal) {
              await supabase.from('stock_balance')
                .update({ quantity: Math.max(0, pltBal.quantity - item.quantity) }).eq('id', pltBal.id);
            }
            await supabase.from('stock_movements').insert({
              outlet_id: fromOutletData.id, sku_id: item.sku_id, movement_type: 'transfer_out',
              quantity: item.quantity, reference_id: transfer.id,
              notes: `Supplied to ${transfer.to_code} — ${transfer.invoice_number}`, created_by: user.name,
            });
          }
          await supabase.from('transfers').update({ plt_stock_deducted: true }).eq('id', transfer.id);
        }
      }

      setReceiptModal(null);
      onUpdated();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setActing(false);
    }
  }

  async function handleDispute() {
    if (!transfer || !user || !disputeText.trim()) return;
    setSubmittingDispute(true);
    try {
      const { data: pltOutlet } = await supabase.from('outlets').select('id').eq('code', 'PLT').single();
      if (pltOutlet) {
        await supabase.from('alerts').insert({
          outlet_id: pltOutlet.id,
          sku_id: transfer.items[0]?.sku_id ?? null,
          alert_type: 'transfer_dispute',
          message: `Transfer Dispute — Invoice ${transfer.invoice_number} (${transfer.to_code}): "${disputeText}"`,
          is_read: false,
        });
      }
      await supabase.from('transfers').update({
        status: 'disputed',
        dispute_notes: disputeText,
      }).eq('id', transfer.id);

      setReceiptModal(null);
      setDisputeText('');
      alert('Discrepancy reported. PLT has been notified.');
      onUpdated();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSubmittingDispute(false);
    }
  }

  function printPDF() {
    if (!transfer) return;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text('TorTracker — Supply Invoice', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Tor Vision Sdn Bhd', 14, 30);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, 36, 182, 32, 3, 3, 'F');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(`Invoice No:  ${transfer.invoice_number}`, 20, 46);
    doc.text(`Date:        ${formatDateTime(transfer.created_at)}`, 20, 54);
    doc.text(`From:        PLT HQ  →  ${transfer.to_name} (${transfer.to_code})`, 20, 62);
    doc.text(`Status:      ${transfer.status.toUpperCase()}`, 110, 46);
    doc.text(`Created by:  ${transfer.created_by}`, 110, 54);
    if (transfer.notes) doc.text(`Notes:  ${transfer.notes}`, 110, 62);

    autoTable(doc, {
      startY: 76,
      head: [['#', 'Brand', 'Model', 'Color', 'Size', 'Qty', 'Item Price', 'RSP']],
      body: transfer.items.map((i, idx) => [
        idx + 1, i.brand, i.model_code, i.color_code, i.size, i.quantity,
        formatCurrency(i.outlet_cost_price), formatCurrency(i.outlet_selling_price),
      ]),
      foot: [['', '', '', '', 'TOTAL', transfer.items.reduce((s, i) => s + i.quantity, 0), '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 30, 30], fontStyle: 'bold' },
    });

    doc.save(`${transfer.invoice_number}.pdf`);
  }

  const statusLabel: Record<TransferStatus, string> = {
    draft: 'Draft', pending_confirmation: 'Pending Confirmation',
    delivered: 'Delivered', received: 'Received', disputed: 'Disputed',
  };

  if (loading) return <LoadingSpinner />;
  if (!transfer) return <div className="text-red-600 p-4">Transfer not found.</div>;

  const isHQUser = outletCode === 'PLT';
  const isRecipient = outletCode === transfer.to_code;
  const totalQty = transfer.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Invoice Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono font-bold text-blue-700 text-xl">{transfer.invoice_number}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[transfer.from_code as OutletCode] ?? ''}`}>{transfer.from_code}</span>
            <span className="text-slate-400">→</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[transfer.to_code as OutletCode] ?? ''}`}>{transfer.to_code}</span>
            <Badge label={statusLabel[transfer.status]} className={STATUS_COLORS[transfer.status]} />
            {!transfer.plt_stock_deducted && transfer.status !== 'received' && (
              <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">On Hold at PLT</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">{formatDateTime(transfer.created_at)} · by {transfer.created_by}</div>
          {transfer.notes && <div className="text-sm text-slate-600 mt-1">Notes: {transfer.notes}</div>}
          {transfer.dispute_notes && (
            <div className="mt-2 flex items-start gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-orange-600 mt-0.5 shrink-0" />
              <span className="text-xs text-orange-700"><b>Dispute:</b> {transfer.dispute_notes}</span>
            </div>
          )}
        </div>
        <button onClick={printPDF} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <Printer size={14} /> Download PDF
        </button>
      </div>

      {/* Items table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Item</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500">Size</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Qty</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Item Price</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">RSP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transfer.items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{item.brand} {item.model_code}</div>
                  <div className="text-xs text-slate-500">{item.color_code}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{item.size}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{item.quantity}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(item.outlet_cost_price)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(item.outlet_selling_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={2} className="px-4 py-2.5 font-semibold text-slate-600">Total</td>
              <td className="px-4 py-2.5 text-right font-bold text-blue-700">{totalQty}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-1">
        {isHQUser && transfer.status === 'pending_confirmation' && (
          <button onClick={confirmDelivered} disabled={acting} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            <CheckCircle size={16} /> Mark as Delivered
          </button>
        )}
        {isRecipient && transfer.status === 'delivered' && (
          <button onClick={() => setReceiptModal('confirm')} disabled={acting} className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
            <CheckCircle size={16} /> Order Received
          </button>
        )}
        {isRecipient && transfer.status === 'disputed' && (
          <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
            <AlertTriangle size={16} /> Dispute submitted — awaiting PLT resolution
          </div>
        )}
      </div>

      {/* Order Received Confirmation Modal */}
      {receiptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative">
            <button onClick={() => { setReceiptModal(null); setDisputeText(''); }} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1">
              <X size={18} />
            </button>

            {receiptModal === 'confirm' && (
              <div className="p-6">
                <h3 className="text-base font-bold text-slate-800 mb-3">Confirm Order Received</h3>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
                  <p className="text-sm font-semibold text-blue-800">{transfer.invoice_number}</p>
                  <p className="text-sm text-blue-600">{totalQty} units · PLT → {transfer.to_code}</p>
                  <div className="mt-2 space-y-0.5">
                    {transfer.items.map((i, idx) => (
                      <p key={idx} className="text-xs text-blue-500">{i.brand} {i.model_code}-{i.color_code} Sz{i.size} × {i.quantity}</p>
                    ))}
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-700 mb-6">
                  Are you sure the order received is accurate to the physical unit count?
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setReceiptModal('dispute')} className="flex-1 px-4 py-2.5 border border-orange-300 text-orange-600 rounded-lg text-sm font-semibold hover:bg-orange-50">
                    No — Report Discrepancy
                  </button>
                  <button onClick={handleOrderReceived} disabled={acting} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                    {acting ? 'Processing…' : 'Yes — Add to Stock'}
                  </button>
                </div>
              </div>
            )}

            {receiptModal === 'dispute' && (
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={18} className="text-orange-600" />
                  <h3 className="text-base font-bold text-orange-700">Report Discrepancy</h3>
                </div>
                <p className="text-sm text-slate-600 mb-3">
                  Describe the inaccuracy. PLT will be notified immediately and no stock will be added until resolved.
                </p>
                <textarea
                  value={disputeText}
                  onChange={(e) => setDisputeText(e.target.value)}
                  placeholder="e.g. Received 1 unit but invoice shows 2. Wrong model delivered..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-h-[100px] resize-none mb-4"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={() => setReceiptModal('confirm')} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50">
                    Back
                  </button>
                  <button onClick={handleDispute} disabled={submittingDispute || !disputeText.trim()} className="flex-1 px-4 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                    {submittingDispute ? 'Submitting…' : 'Submit & Notify PLT'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
