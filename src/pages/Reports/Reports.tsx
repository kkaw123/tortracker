import { useState } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Download, BarChart3, FileText, TrendingUp, Package, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { OUTLETS } from '../../lib/utils';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

type ReportType = 'stock_summary' | 'fast_movers' | 'quality_complaints' | 'cost_summary' | 'closing_balance' | 'opening_balance';

export default function Reports() {
  const { outletId } = useParams<{ outletId: string }>();
  const { isBoss } = useAuth();
  const outletCode = outletId?.toUpperCase();

  const [reportType, setReportType] = useState<ReportType>('stock_summary');
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedOutlet, setSelectedOutlet] = useState(outletCode ?? 'all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [generated, setGenerated] = useState(false);

  async function generateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      let outletIds: string[] = [];
      if (selectedOutlet === 'all') {
        const { data } = await supabase.from('outlets').select('id, code');
        outletIds = (data ?? []).map((o: any) => o.id);
      } else {
        const { data } = await supabase.from('outlets').select('id').eq('code', selectedOutlet).single();
        if (data) outletIds = [data.id];
      }

      let dateStart: string, dateEnd: string;
      if (period === 'monthly') {
        const [y, m] = selectedDate.split('-').map(Number);
        dateStart = format(startOfMonth(new Date(y, m - 1)), 'yyyy-MM-dd');
        dateEnd = format(endOfMonth(new Date(y, m - 1)), 'yyyy-MM-dd');
      } else if (period === 'yearly') {
        dateStart = `${selectedYear}-01-01`;
        dateEnd = `${selectedYear}-12-31`;
      } else {
        dateStart = selectedDate;
        dateEnd = selectedDate;
      }

      let rows: any[] = [];

      if (reportType === 'stock_summary' || reportType === 'closing_balance' || reportType === 'opening_balance') {
        const { data: balances } = await supabase
          .from('stock_balance')
          .select(`quantity, low_stock_threshold, outlet_id, sku_id,
            skus!inner(color_code, size, frame_models!inner(brand, model_code, frame_type, category)),
            outlet_sku_prices(cost_price, selling_price, outlet_id),
            outlets!inner(code, name)`)
          .in('outlet_id', outletIds);

        rows = (balances ?? []).map((b: any) => {
          const price = b.outlet_sku_prices?.find((p: any) => p.outlet_id === b.outlet_id);
          return {
            'Outlet': b.outlets?.code,
            'Brand': b.skus?.frame_models?.brand,
            'Model Code': b.skus?.frame_models?.model_code,
            'Color': b.skus?.color_code,
            'Size': b.skus?.size,
            'Frame Type': b.skus?.frame_models?.frame_type,
            'Category': b.skus?.frame_models?.category,
            'Quantity': b.quantity,
            'Low Stock Threshold': b.low_stock_threshold,
            'Cost Price': price?.cost_price ?? 0,
            'Total Cost Value': (b.quantity * (price?.cost_price ?? 0)).toFixed(2),
            'Selling Price': price?.selling_price ?? 0,
            'Report Date': period === 'monthly' ? dateEnd : period === 'yearly' ? `${selectedYear}-12-31` : dateEnd,
          };
        });
      }

      else if (reportType === 'fast_movers') {
        const { data: movements } = await supabase
          .from('stock_movements')
          .select(`sku_id, quantity, outlet_id,
            skus!inner(color_code, size, frame_models!inner(brand, model_code, frame_type)),
            outlets!inner(code)`)
          .in('outlet_id', outletIds)
          .eq('movement_type', 'out')
          .gte('created_at', dateStart)
          .lte('created_at', dateEnd + 'T23:59:59');

        const agg: Record<string, any> = {};
        (movements ?? []).forEach((m: any) => {
          const key = `${m.outlet_id}_${m.sku_id}`;
          if (!agg[key]) agg[key] = {
            'Outlet': m.outlets?.code,
            'Brand': m.skus?.frame_models?.brand,
            'Model': m.skus?.frame_models?.model_code,
            'Color': m.skus?.color_code,
            'Size': m.skus?.size,
            'Type': m.skus?.frame_models?.frame_type,
            'Units Sold': 0,
          };
          agg[key]['Units Sold'] += m.quantity;
        });
        rows = Object.values(agg).sort((a, b) => b['Units Sold'] - a['Units Sold']);
      }

      else if (reportType === 'quality_complaints') {
        const { data: complaints } = await supabase
          .from('complaints')
          .select(`reference_number, complaint_type, description, reported_by, status, is_manufacturer_defect, warranty_claimed, created_at,
            outlets!inner(code),
            skus!inner(color_code, size, frame_models!inner(brand, model_code))`)
          .in('outlet_id', outletIds)
          .gte('created_at', dateStart)
          .lte('created_at', dateEnd + 'T23:59:59');

        rows = (complaints ?? []).map((c: any) => ({
          'Outlet': c.outlets?.code,
          'Reference': c.reference_number,
          'Brand': c.skus?.frame_models?.brand,
          'Model': c.skus?.frame_models?.model_code,
          'Color': c.skus?.color_code,
          'Complaint Type': c.complaint_type,
          'Description': c.description,
          'Reported By': c.reported_by,
          'Status': c.status,
          'Manufacturer Defect': c.is_manufacturer_defect ? 'Yes' : 'No',
          'Warranty Claimed': c.warranty_claimed ? 'Yes' : 'No',
          'Date': c.created_at.slice(0, 10),
        }));
      }

      else if (reportType === 'cost_summary') {
        // Monthly cost of stock received (via transfers + POs)
        const { data: transfers } = await supabase
          .from('transfers')
          .select(`invoice_number, created_at, to_outlet_id,
            to_outlet:outlets!transfers_to_outlet_id_fkey(code),
            transfer_items(quantity, outlet_cost_price, skus!inner(color_code, size, frame_models!inner(brand, model_code)))`)
          .in('to_outlet_id', outletIds)
          .eq('status', 'received')
          .gte('received_at', dateStart)
          .lte('received_at', dateEnd + 'T23:59:59');

        rows = [];
        (transfers ?? []).forEach((t: any) => {
          (t.transfer_items ?? []).forEach((item: any) => {
            rows.push({
              'Invoice': t.invoice_number,
              'Outlet': t.to_outlet?.code,
              'Brand': item.skus?.frame_models?.brand,
              'Model': item.skus?.frame_models?.model_code,
              'Color': item.skus?.color_code,
              'Qty Received': item.quantity,
              'Cost Price': item.outlet_cost_price,
              'Total Cost': (item.quantity * item.outlet_cost_price).toFixed(2),
              'Date': t.created_at.slice(0, 10),
            });
          });
        });
      }

      setReportData(rows);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `tortracker_${reportType}_${selectedDate || selectedYear}.xlsx`);
  }

  const REPORT_TYPES: { value: ReportType; label: string; icon: React.ReactNode }[] = [
    { value: 'stock_summary', label: 'Stock Summary', icon: <Package size={16} /> },
    { value: 'fast_movers', label: 'Fast Moving Items', icon: <TrendingUp size={16} /> },
    { value: 'quality_complaints', label: 'Quality Complaints', icon: <FileText size={16} /> },
    { value: 'cost_summary', label: 'Cost Summary (Received)', icon: <DollarSign size={16} /> },
    { value: 'closing_balance', label: 'Closing Balance', icon: <BarChart3 size={16} /> },
    { value: 'opening_balance', label: 'Opening Balance', icon: <BarChart3 size={16} /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Reports</h2>
        <p className="text-sm text-slate-500">Generate and export inventory reports</p>
      </div>

      {/* Report config */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Report Type</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {REPORT_TYPES.map((r) => (
              <button
                key={r.value}
                onClick={() => setReportType(r.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm ${reportType === r.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
              >
                {r.icon} {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as any)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {period === 'yearly' ? 'Year' : period === 'monthly' ? 'Month' : 'Date'}
            </label>
            {period === 'yearly' ? (
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
              </select>
            ) : (
              <input type={period === 'monthly' ? 'month' : 'date'} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
          {isBoss() && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outlet</label>
              <select value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="all">All Outlets</option>
                {OUTLETS.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={generateReport}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner text="Generating report..." />}

      {generated && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">{reportData.length} rows</div>
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={14} /> Export to Excel
            </button>
          </div>

          {reportData.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-400 border border-slate-100">No data found for the selected period and filters.</div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr>
                      {Object.keys(reportData[0]).map((key) => (
                        <th key={key} className="text-left px-3 py-2.5 font-semibold text-slate-500 uppercase whitespace-nowrap">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {Object.values(row).map((val, i) => (
                          <td key={i} className="px-3 py-2 text-slate-700 whitespace-nowrap">{String(val ?? '-')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
