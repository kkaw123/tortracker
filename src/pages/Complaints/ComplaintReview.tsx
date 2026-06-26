import { useEffect, useState } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDateTime, STATUS_COLORS, OUTLET_COLORS } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import Modal from '../../components/Common/Modal';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import ComplaintDetailView from './ComplaintDetailView';
import type { OutletCode, ComplaintStatus } from '../../types';

interface ComplaintRow {
  id: string;
  reference_number: string;
  brand: string;
  model_code: string;
  color_code: string;
  outlet_code: OutletCode;
  complaint_type: string;
  reported_by: string;
  status: ComplaintStatus;
  is_manufacturer_defect: boolean;
  created_at: string;
  count_this_model: number;
}

export default function ComplaintReview() {
  const [complaints, setComplaints] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('open');

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data } = await supabase
      .from('complaints')
      .select(`id, reference_number, complaint_type, reported_by, status, is_manufacturer_defect, created_at,
        outlets!inner(code),
        skus!inner(color_code, frame_models!inner(brand, model_code))`)
      .order('created_at', { ascending: false });

    const allComplaints = (data ?? []).map((c: any) => ({
      id: c.id,
      reference_number: c.reference_number,
      brand: c.skus?.frame_models?.brand ?? '',
      model_code: c.skus?.frame_models?.model_code ?? '',
      color_code: c.skus?.color_code ?? '',
      outlet_code: c.outlets?.code ?? '',
      complaint_type: c.complaint_type,
      reported_by: c.reported_by,
      status: c.status,
      is_manufacturer_defect: c.is_manufacturer_defect,
      created_at: c.created_at,
      count_this_model: 0,
    }));

    // Count complaints per model_code
    const modelCounts: Record<string, number> = {};
    allComplaints.forEach((c) => {
      modelCounts[c.model_code] = (modelCounts[c.model_code] ?? 0) + 1;
    });
    allComplaints.forEach((c) => { c.count_this_model = modelCounts[c.model_code]; });

    setComplaints(allComplaints);
    setLoading(false);
  }

  // Group by model for defect dashboard
  const defectModels = Object.entries(
    complaints
      .filter((c) => c.is_manufacturer_defect)
      .reduce((acc: Record<string, { brand: string; count: number; types: string[] }>, c) => {
        if (!acc[c.model_code]) acc[c.model_code] = { brand: c.brand, count: 0, types: [] };
        acc[c.model_code].count++;
        if (!acc[c.model_code].types.includes(c.complaint_type)) acc[c.model_code].types.push(c.complaint_type);
        return acc;
      }, {})
  ).sort((a, b) => b[1].count - a[1].count);

  const filtered = filterStatus === 'all' ? complaints : complaints.filter((c) => c.status === filterStatus);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Complaint Review Dashboard</h2>
        <p className="text-sm text-slate-500">Manage all complaints across all outlets</p>
      </div>

      {/* Defect Summary */}
      {defectModels.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert size={16} className="text-red-600" />
            <span className="font-semibold text-red-800">Manufacturer Defect Models — Avoid Restocking</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {defectModels.map(([modelCode, info]) => (
              <div key={modelCode} className="bg-white rounded-lg p-3 border border-red-200">
                <div className="font-semibold text-slate-800">{info.brand} {modelCode}</div>
                <div className="text-sm text-red-600 font-bold">{info.count} defect reports</div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-1">
                  {info.types.map((t) => (
                    <span key={t} className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['open', 'reviewed', 'resolved', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filterStatus === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            {' '}({s === 'all' ? complaints.length : complaints.filter((c) => c.status === s).length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ref</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Frame</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Outlet</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Repeat</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase">Defect</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-center px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400">No complaints found.</td></tr>
              ) : filtered.map((c) => (
                <tr key={c.id} className={`hover:bg-slate-50 ${c.count_this_model >= 3 ? 'border-l-4 border-l-red-400' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{c.reference_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.brand} {c.model_code}</div>
                    <div className="text-xs text-slate-500">{c.color_code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[c.outlet_code] ?? ''}`}>{c.outlet_code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{c.complaint_type}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${c.count_this_model >= 3 ? 'text-red-600' : 'text-slate-600'}`}>
                      {c.count_this_model}x
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge label={c.status.charAt(0).toUpperCase() + c.status.slice(1)} className={STATUS_COLORS[c.status]} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.is_manufacturer_defect
                      ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Yes</span>
                      : <span className="text-xs text-slate-400">-</span>}
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

      <Modal open={!!viewId} onClose={() => setViewId(null)} title="Review Complaint" size="lg">
        {viewId && <ComplaintDetailView complaintId={viewId} canReview={true} onUpdated={() => { setViewId(null); fetchData(); }} />}
      </Modal>
    </div>
  );
}
