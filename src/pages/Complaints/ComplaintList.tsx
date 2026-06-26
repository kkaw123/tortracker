import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, STATUS_COLORS } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import Modal from '../../components/Common/Modal';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import ComplaintForm from './ComplaintForm';
import ComplaintDetailView from './ComplaintDetailView';
import type { OutletCode, ComplaintStatus, ComplaintType } from '../../types';

interface ComplaintRow {
  id: string;
  reference_number: string;
  brand: string;
  model_code: string;
  color_code: string;
  complaint_type: ComplaintType;
  reported_by: string;
  status: ComplaintStatus;
  is_manufacturer_defect: boolean;
  warranty_claimed: boolean;
  created_at: string;
}

export default function ComplaintList() {
  const { outletId } = useParams<{ outletId: string }>();
  useAuth();
  const outletCode = outletId?.toUpperCase() as OutletCode;

  const [outlet, setOutlet] = useState<{ id: string; code: string } | null>(null);
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { fetchData(); }, [outletId]);

  async function fetchData() {
    setLoading(true);
    const { data: outletData } = await supabase.from('outlets').select('*').eq('code', outletCode).single();
    if (!outletData) { setLoading(false); return; }
    setOutlet(outletData);

    const { data } = await supabase
      .from('complaints')
      .select(`id, reference_number, complaint_type, reported_by, status, is_manufacturer_defect, warranty_claimed, created_at,
        skus!inner(color_code, frame_models!inner(brand, model_code))`)
      .eq('outlet_id', outletData.id)
      .order('created_at', { ascending: false });

    setComplaints((data ?? []).map((c: any) => ({
      id: c.id,
      reference_number: c.reference_number,
      brand: c.skus?.frame_models?.brand ?? '',
      model_code: c.skus?.frame_models?.model_code ?? '',
      color_code: c.skus?.color_code ?? '',
      complaint_type: c.complaint_type,
      reported_by: c.reported_by,
      status: c.status,
      is_manufacturer_defect: c.is_manufacturer_defect,
      warranty_claimed: c.warranty_claimed,
      created_at: c.created_at,
    })));
    setLoading(false);
  }

  const filtered = filterStatus ? complaints.filter((c) => c.status === filterStatus) : complaints;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Quality Complaints</h2>
          <p className="text-sm text-slate-500">{complaints.length} total · {outletCode}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
        >
          <Plus size={14} /> Submit Complaint
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {['', 'open', 'reviewed', 'resolved'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} {s === '' ? `(${complaints.length})` : `(${complaints.filter((c) => c.status === s).length})`}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ref No.</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Frame</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Complaint Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reported By</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Defect</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">No complaints found.</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{c.reference_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.brand} {c.model_code}</div>
                    <div className="text-xs text-slate-500">{c.color_code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{c.complaint_type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.reported_by}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge label={c.status.charAt(0).toUpperCase() + c.status.slice(1)} className={STATUS_COLORS[c.status]} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.is_manufacturer_defect ? (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Yes</span>
                    ) : <span className="text-xs text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setViewId(c.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Submit Quality Complaint" size="lg">
        {outlet && (
          <ComplaintForm
            outlet={outlet}
            onSaved={() => { setShowForm(false); fetchData(); }}
            onCancel={() => setShowForm(false)}
          />
        )}
      </Modal>

      <Modal open={!!viewId} onClose={() => setViewId(null)} title="Complaint Details" size="lg">
        {viewId && <ComplaintDetailView complaintId={viewId} canReview={false} onUpdated={fetchData} />}
      </Modal>
    </div>
  );
}
