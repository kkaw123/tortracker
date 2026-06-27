import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, STATUS_COLORS, OUTLET_COLORS } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import Modal from '../../components/Common/Modal';
import CreateTransfer from './CreateTransfer';
import TransferDetail from './TransferDetail';
import type { OutletCode, TransferStatus } from '../../types';

interface TransferRow {
  id: string;
  invoice_number: string;
  from_code: string;
  to_code: string;
  to_name: string;
  status: TransferStatus;
  created_by: string;
  created_at: string;
  item_count: number;
  total_qty: number;
  plt_stock_deducted: boolean;
}

export default function TransferList() {
  const { outletId } = useParams<{ outletId: string }>();
  useAuth();
  const outletCode = outletId?.toUpperCase() as OutletCode;

  const [outlet, setOutlet] = useState<{ id: string; code: string } | null>(null);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, [outletId]);

  async function fetchData() {
    setLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', outletCode).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    let query = supabase
      .from('transfers')
      .select(`id, invoice_number, status, created_by, created_at, notes, plt_stock_deducted,
        from_outlet:outlets!transfers_from_outlet_id_fkey(code),
        to_outlet:outlets!transfers_to_outlet_id_fkey(code, name),
        transfer_items(quantity)`)
      .order('created_at', { ascending: false });

    if (outletCode === 'PLT') {
      query = query.eq('from_outlet_id', outletData.id);
    } else {
      query = query.eq('to_outlet_id', outletData.id);
    }

    const { data } = await query;
    const rows: TransferRow[] = (data ?? []).map((t: any) => ({
      id: t.id,
      invoice_number: t.invoice_number,
      from_code: t.from_outlet?.code ?? '',
      to_code: t.to_outlet?.code ?? '',
      to_name: t.to_outlet?.name ?? '',
      status: t.status,
      created_by: t.created_by,
      created_at: t.created_at,
      item_count: t.transfer_items?.length ?? 0,
      total_qty: (t.transfer_items ?? []).reduce((s: number, i: any) => s + i.quantity, 0),
      plt_stock_deducted: t.plt_stock_deducted ?? true,
    }));
    setTransfers(rows);
    setLoading(false);
  }

  const statusLabel: Record<TransferStatus, string> = {
    draft: 'Draft',
    pending_confirmation: 'Pending Confirm',
    delivered: 'Delivered',
    received: 'Received',
    disputed: 'Disputed',
  };

  if (loading) return <LoadingSpinner />;

  const isPLT = outletCode === 'PLT';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {isPLT ? 'Supply to Outlets' : 'Received Order History'}
          </h2>
          <p className="text-sm text-slate-500">{transfers.length} records</p>
        </div>
        {isPLT && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} /> New Supply
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                  {isPLT ? 'To Outlet' : 'From'}
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">SKUs</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transfers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No records found.</td></tr>
              ) : transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  {/* Clickable invoice number */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewId(t.id)}
                      className="font-mono text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      {t.invoice_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isPLT ? (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${OUTLET_COLORS[t.to_code as OutletCode] ?? ''}`}>{t.to_code}</span>
                      ) : (
                        <>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${OUTLET_COLORS[t.from_code as OutletCode] ?? ''}`}>{t.from_code}</span>
                          <span className="text-slate-400">→</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${OUTLET_COLORS[t.to_code as OutletCode] ?? ''}`}>{t.to_code}</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <Badge label={statusLabel[t.status]} className={STATUS_COLORS[t.status]} />
                      {isPLT && !t.plt_stock_deducted && (t.status === 'pending_confirmation' || t.status === 'delivered') && (
                        <span className="text-xs bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">On Hold</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{t.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{t.total_qty}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    {/* Quick Order Received button for outlet users */}
                    {!isPLT && t.status === 'delivered' ? (
                      <button
                        onClick={() => setViewId(t.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                      >
                        <CheckCircle size={12} /> Order Received
                      </button>
                    ) : (
                      <button
                        onClick={() => setViewId(t.id)}
                        className="text-xs text-blue-600 hover:underline px-2"
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Transfer Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Supply" size="xl">
        {outlet && (
          <CreateTransfer
            pltOutlet={outlet}
            onCreated={() => { setShowCreate(false); fetchData(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </Modal>

      {/* Transfer Detail / Invoice Modal */}
      <Modal open={!!viewId} onClose={() => { setViewId(null); fetchData(); }} title="Supply Invoice" size="xl">
        {viewId && (
          <TransferDetail
            transferId={viewId}
            outletCode={outletCode}
            onUpdated={() => { setViewId(null); fetchData(); }}
          />
        )}
      </Modal>
    </div>
  );
}
