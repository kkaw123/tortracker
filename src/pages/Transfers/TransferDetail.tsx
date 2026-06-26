import { useEffect, useState } from 'react';
import { CheckCircle, Printer } from 'lucide-react';
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
  created_by: string;
  created_at: string;
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

  useEffect(() => { fetchTransfer(); }, [transferId]);

  async function fetchTransfer() {
    setLoading(true);
    const { data } = await supabase
      .from('transfers')
      .select(`
        id, invoice_number, status, notes, created_by, created_at,
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
      notes: data.notes,
      created_by: data.created_by,
      created_at: data.created_at,
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

  async function confirmReceived() {
    if (!transfer || !user) return;
    setActing(true);
    try {
      await supabase.from('transfers').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', transfer.id);

      // Get destination outlet id
      const { data: toOutletData } = await supabase.from('outlets').select('id').eq('code', transfer.to_code).single();
      if (!toOutletData) throw new Error('Outlet not found');

      for (const item of transfer.items) {
        // Check if stock balance exists for this outlet+sku
        const { data: existing } = await supabase
          .from('stock_balance')
          .select('id, quantity')
          .eq('outlet_id', toOutletData.id)
          .eq('sku_id', item.sku_id)
          .single();

        if (existing) {
          await supabase.from('stock_balance')
            .update({ quantity: existing.quantity + item.quantity })
            .eq('id', existing.id);
        } else {
          await supabase.from('stock_balance').insert({
            outlet_id: toOutletData.id, sku_id: item.sku_id,
            quantity: item.quantity, low_stock_threshold: 5,
          });
        }

        // Set outlet prices
        await supabase.from('outlet_sku_prices').upsert({
          sku_id: item.sku_id, outlet_id: toOutletData.id,
          cost_price: item.outlet_cost_price, selling_price: item.outlet_selling_price,
        }, { onConflict: 'sku_id,outlet_id' });

        // Log movement
        await supabase.from('stock_movements').insert({
          outlet_id: toOutletData.id, sku_id: item.sku_id, movement_type: 'transfer_in',
          quantity: item.quantity, reference_id: transfer.id,
          notes: `Transfer from PLT (${transfer.invoice_number})`, created_by: user.name,
        });
      }

      onUpdated();
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setActing(false);
    }
  }

  function printPDF() {
    if (!transfer) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('TorTracker — Transfer Invoice', 14, 20);
    doc.setFontSize(11);
    doc.text(`Invoice No: ${transfer.invoice_number}`, 14, 30);
    doc.text(`From: PLT HQ  →  To: ${transfer.to_name} (${transfer.to_code})`, 14, 37);
    doc.text(`Date: ${formatDateTime(transfer.created_at)}`, 14, 44);
    doc.text(`Created by: ${transfer.created_by}`, 14, 51);
    doc.text(`Status: ${transfer.status.toUpperCase()}`, 14, 58);
    if (transfer.notes) doc.text(`Notes: ${transfer.notes}`, 14, 65);

    autoTable(doc, {
      startY: 72,
      head: [['Brand', 'Model', 'Color', 'Size', 'Qty', 'PLT Cost', 'Outlet Cost', 'Outlet Sell']],
      body: transfer.items.map((i) => [
        i.brand, i.model_code, i.color_code, i.size, i.quantity,
        formatCurrency(i.plt_cost_price), formatCurrency(i.outlet_cost_price), formatCurrency(i.outlet_selling_price),
      ]),
      foot: [['', '', '', 'TOTAL', transfer.items.reduce((s, i) => s + i.quantity, 0), '', '', '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`transfer_${transfer.invoice_number}.pdf`);
  }

  const statusLabel: Record<TransferStatus, string> = {
    draft: 'Draft', pending_confirmation: 'Pending Confirmation',
    delivered: 'Delivered', received: 'Received',
  };

  if (loading) return <LoadingSpinner />;
  if (!transfer) return <div className="text-red-600 p-4">Transfer not found.</div>;

  const isHQUser = outletCode === 'PLT';
  const isRecipient = outletCode === transfer.to_code;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono font-bold text-blue-700 text-lg">{transfer.invoice_number}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[transfer.from_code as OutletCode] ?? ''}`}>{transfer.from_code}</span>
            <span className="text-slate-400">→</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[transfer.to_code as OutletCode] ?? ''}`}>{transfer.to_code}</span>
            <Badge label={statusLabel[transfer.status]} className={STATUS_COLORS[transfer.status]} />
          </div>
          <div className="text-xs text-slate-500 mt-1">{formatDateTime(transfer.created_at)} · by {transfer.created_by}</div>
          {transfer.notes && <div className="text-sm text-slate-600 mt-1">Notes: {transfer.notes}</div>}
        </div>
        <button onClick={printPDF} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <Printer size={14} /> Export PDF
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
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">PLT Cost</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Outlet Cost</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500">Outlet Sell</th>
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
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(item.plt_cost_price)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(item.outlet_cost_price)}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(item.outlet_selling_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={2} className="px-4 py-2.5 font-semibold text-slate-600">Total</td>
              <td className="px-4 py-2.5 text-right font-bold text-blue-700">{transfer.items.reduce((s, i) => s + i.quantity, 0)}</td>
              <td colSpan={3}></td>
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
          <button onClick={confirmReceived} disabled={acting} className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
            <CheckCircle size={16} /> Confirm Receipt — Add to Stock
          </button>
        )}
      </div>
    </div>
  );
}
