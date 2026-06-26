import { useEffect, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { COMPLAINT_TYPES, generateRefNumber } from '../../lib/utils';

interface Props {
  outlet: { id: string; code: string };
  onSaved: () => void;
  onCancel: () => void;
}

interface SKUOption {
  sku_id: string;
  label: string;
}

export default function ComplaintForm({ outlet, onSaved, onCancel }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [skuOptions, setSkuOptions] = useState<SKUOption[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [complaintType, setComplaintType] = useState(COMPLAINT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [reportedBy, setReportedBy] = useState(user?.name ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  useEffect(() => { fetchSKUs(); }, []);

  async function fetchSKUs() {
    const { data } = await supabase
      .from('stock_balance')
      .select(`sku_id, skus!inner(color_code, size, frame_models!inner(brand, model_code))`)
      .eq('outlet_id', outlet.id);
    setSkuOptions((data ?? []).map((b: any) => ({
      sku_id: b.sku_id,
      label: `${b.skus?.frame_models?.brand} ${b.skus?.frame_models?.model_code}-${b.skus?.color_code} (Sz ${b.skus?.size})`,
    })));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, 4));
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreviews((prev) => [...prev, ev.target?.result as string].slice(0, 4));
      reader.readAsDataURL(file);
    });
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  const filteredSkus = skuOptions.filter((s) =>
    !skuSearch || s.label.toLowerCase().includes(skuSearch.toLowerCase())
  );

  async function handleSubmit() {
    setError('');
    if (!selectedSku) { setError('Please select a frame model.'); return; }
    if (!description.trim()) { setError('Please enter a complaint description.'); return; }
    setSaving(true);
    try {
      const refNo = generateRefNumber('QC');
      const photoUrls: string[] = [];

      // Upload photos to Supabase Storage
      for (const photo of photos) {
        const fileName = `${refNo}_${Date.now()}_${photo.name}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('complaint-photos')
          .upload(fileName, photo, { cacheControl: '3600', upsert: false });
        if (!uploadErr && uploadData) {
          const { data: urlData } = supabase.storage.from('complaint-photos').getPublicUrl(fileName);
          photoUrls.push(urlData.publicUrl);
        }
      }

      const { error: insertErr } = await supabase.from('complaints').insert({
        outlet_id: outlet.id,
        sku_id: selectedSku,
        reference_number: refNo,
        complaint_type: complaintType,
        description: description.trim(),
        reported_by: reportedBy.trim() || user?.name,
        photo_urls: photoUrls,
        status: 'open',
        is_manufacturer_defect: false,
        warranty_claimed: false,
      });
      if (insertErr) throw new Error(insertErr.message);
      onSaved();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit complaint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {/* Frame selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Frame Model <span className="text-red-500">*</span></label>
        <input
          value={skuSearch}
          onChange={(e) => { setSkuSearch(e.target.value); setSelectedSku(''); }}
          placeholder="Search brand, model, color..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {skuSearch && !selectedSku && (
          <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden shadow max-h-40 overflow-y-auto bg-white">
            {filteredSkus.slice(0, 20).map((s) => (
              <button
                key={s.sku_id}
                onClick={() => { setSelectedSku(s.sku_id); setSkuSearch(s.label); }}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
              >
                {s.label}
              </button>
            ))}
            {filteredSkus.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No items found.</div>}
          </div>
        )}
        {selectedSku && <div className="mt-1 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">Selected: {skuSearch}</div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Complaint Type <span className="text-red-500">*</span></label>
          <select value={complaintType} onChange={(e) => setComplaintType(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {COMPLAINT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reported By</label>
          <input
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Complaint Description <span className="text-red-500">*</span></label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the issue in detail..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* Photo upload */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Photos (max 4)</label>
        <div className="flex gap-2 flex-wrap">
          {photoPreviews.map((src, idx) => (
            <div key={idx} className="relative w-20 h-20">
              <img src={src} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
              <button
                onClick={() => removePhoto(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <label className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-blue-400 hover:bg-blue-50">
              <Camera size={20} className="text-slate-400" />
              <span className="text-xs text-slate-400">Add Photo</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
            </label>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? 'Submitting...' : 'Submit Complaint'}
        </button>
      </div>
    </div>
  );
}
