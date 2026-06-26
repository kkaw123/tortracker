import { useEffect, useState } from 'react';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime, STATUS_COLORS, OUTLET_COLORS } from '../../lib/utils';
import Badge from '../../components/Common/Badge';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import type { ComplaintStatus, OutletCode } from '../../types';

interface ComplaintFull {
  id: string;
  reference_number: string;
  brand: string;
  model_code: string;
  color_code: string;
  size: string;
  outlet_code: OutletCode;
  complaint_type: string;
  description: string;
  reported_by: string;
  photo_urls: string[];
  status: ComplaintStatus;
  reviewed_by: string | null;
  review_notes: string | null;
  is_manufacturer_defect: boolean;
  warranty_claimed: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  complaintId: string;
  canReview: boolean;
  onUpdated: () => void;
}

export default function ComplaintDetailView({ complaintId, canReview, onUpdated }: Props) {
  const { user } = useAuth();
  const [complaint, setComplaint] = useState<ComplaintFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isDefect, setIsDefect] = useState(false);
  const [warrantyClaim, setWarrantyClaim] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchComplaint(); }, [complaintId]);

  async function fetchComplaint() {
    setLoading(true);
    const { data } = await supabase
      .from('complaints')
      .select(`id, reference_number, complaint_type, description, reported_by, photo_urls, status, reviewed_by, review_notes, is_manufacturer_defect, warranty_claimed, created_at, updated_at,
        outlets!inner(code),
        skus!inner(color_code, size, frame_models!inner(brand, model_code))`)
      .eq('id', complaintId)
      .single();
    if (!data) { setLoading(false); return; }
    const c: ComplaintFull = {
      id: data.id,
      reference_number: data.reference_number,
      brand: (data as any).skus?.frame_models?.brand ?? '',
      model_code: (data as any).skus?.frame_models?.model_code ?? '',
      color_code: (data as any).skus?.color_code ?? '',
      size: (data as any).skus?.size ?? '',
      outlet_code: (data as any).outlets?.code ?? '',
      complaint_type: data.complaint_type,
      description: data.description,
      reported_by: data.reported_by,
      photo_urls: data.photo_urls ?? [],
      status: data.status,
      reviewed_by: data.reviewed_by,
      review_notes: data.review_notes,
      is_manufacturer_defect: data.is_manufacturer_defect,
      warranty_claimed: data.warranty_claimed,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
    setComplaint(c);
    setReviewNotes(c.review_notes ?? '');
    setIsDefect(c.is_manufacturer_defect);
    setWarrantyClaim(c.warranty_claimed);
    setLoading(false);
  }

  async function submitReview(newStatus: ComplaintStatus) {
    if (!complaint || !user) return;
    setSaving(true);
    await supabase.from('complaints').update({
      status: newStatus,
      reviewed_by: user.name,
      review_notes: reviewNotes,
      is_manufacturer_defect: isDefect,
      warranty_claimed: warrantyClaim,
      updated_at: new Date().toISOString(),
    }).eq('id', complaint.id);
    setSaving(false);
    onUpdated();
    fetchComplaint();
  }

  if (loading) return <LoadingSpinner />;
  if (!complaint) return <div className="text-red-600 p-4">Complaint not found.</div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono font-bold text-blue-700">{complaint.reference_number}</div>
          <h3 className="text-lg font-semibold text-slate-800 mt-1">{complaint.brand} {complaint.model_code}-{complaint.color_code}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${OUTLET_COLORS[complaint.outlet_code] ?? ''}`}>{complaint.outlet_code}</span>
            <Badge label={complaint.status.charAt(0).toUpperCase() + complaint.status.slice(1)} className={STATUS_COLORS[complaint.status]} />
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">{complaint.complaint_type}</span>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Submitted: {formatDateTime(complaint.created_at)}</div>
          <div>By: {complaint.reported_by}</div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Complaint Description</div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{complaint.description}</p>
      </div>

      {/* Photos */}
      {complaint.photo_urls.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Photos</div>
          <div className="flex gap-2 flex-wrap">
            {complaint.photo_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" className="w-24 h-24 object-cover rounded-lg border border-slate-200 hover:opacity-80" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Review section */}
      {complaint.reviewed_by && !canReview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-blue-700 uppercase mb-2">Review by {complaint.reviewed_by}</div>
          {complaint.review_notes && <p className="text-sm text-slate-700 mb-2">{complaint.review_notes}</p>}
          <div className="flex gap-3 flex-wrap">
            {complaint.is_manufacturer_defect && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Manufacturer Defect</span>
            )}
            {complaint.warranty_claimed && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Warranty Claim Approved</span>
            )}
          </div>
        </div>
      )}

      {canReview && complaint.status !== 'resolved' && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-700">Review & Decision</div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Review Notes</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Add review notes..."
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isDefect} onChange={(e) => setIsDefect(e.target.checked)} className="w-4 h-4 accent-red-500" />
              <ShieldAlert size={14} className="text-red-500" />
              Manufacturer Defect
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={warrantyClaim} onChange={(e) => setWarrantyClaim(e.target.checked)} className="w-4 h-4 accent-purple-500" />
              Approve Warranty Exchange
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => submitReview('reviewed')}
              disabled={saving}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50"
            >
              Mark as Reviewed
            </button>
            <button
              onClick={() => submitReview('resolved')}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle size={14} /> Resolve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
