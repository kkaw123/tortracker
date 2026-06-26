import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
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

    // PLT sees outgoing, other outlets see incoming
    let query = supabase
      .from('transfers')
      .select(`id, invoice_number, status, created_by, created_at, notes,
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
    }));
    setTransfers(rows);
    setLoading(false);
  }

  const statusLabel: Record<TransferStatus, string> = {
    draft: 'Draft',
    pending_confirmation: 'Pending Confirm',
    delivered: 'Delivered',
    received: 'Received',
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {outletCode === 'PLT' ? 'Outgoing Transfers' : 'Incoming Transfers'}
          </h2>
          <p className="text-sm text-slate-500">{transfers.length} transfer records</p>
        </div>
        {outletCode === 'PLT' && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={14} /> New Transfer
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Invoice No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">From → To</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Items</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Total Qty</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Created</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">By</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transfers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">No transfers found.</td></tr>
              ) : transfers.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-blue-700">{t.invoice_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${OUTLET_COLORS[t.from_code as OutletCode] ?? ''}`}>{t.from_code}</span>
                      <span className="text-slate-400">→</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${OUTLET_COLORS[t.to_code as OutletCode] ?? ''}`}>{t.to_code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge label={statusLabel[t.status]} className={STATUS_COLORS[t.status]} />
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{t.item_count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{t.total_qty}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{formatDateTime(t.created_at)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{t.created_by}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setViewId(t.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="View details">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Transfer Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New Transfer" size="xl">
        {outlet && (
          <CreateTransfer
            pltOutlet={outlet}
            onCreated={() => { setShowCreate(false); fetchData(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </Modal>

      {/* Transfer Detail Modal */}
      <Modal open={!!viewId} onClose={() => setViewId(null)} title="Transfer Details" size="xl">
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
