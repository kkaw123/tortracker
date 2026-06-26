export type OutletCode = 'SS2' | 'KD' | 'CHR' | 'PLT';
export type UserRole = 'boss' | 'joey' | 'pic' | 'admin';
export type FrameType = 'Sports' | 'Titanium' | 'Lightweight' | 'Clip On' | 'Plastic';
export type Category = 'Frame' | 'Sunglass';
export type TransferStatus = 'draft' | 'pending_confirmation' | 'delivered' | 'received';
export type ComplaintStatus = 'open' | 'reviewed' | 'resolved';
export type ComplaintType = 'Color Faded' | 'Hinge Broken' | 'Frame Cracked' | 'Lens Issue' | 'Coating Peeled' | 'Nose Pad Issue' | 'Temple Broken' | 'Other';
export type MovementType = 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'adjustment';
export type POStatus = 'pending' | 'received' | 'partial';

export interface Outlet {
  id: string;
  code: OutletCode;
  name: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  outlet_id: string | null;
  outlet_code: OutletCode | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  created_at: string;
}

export interface FrameModel {
  id: string;
  brand: string;
  model_code: string;
  frame_type: FrameType;
  category: Category;
  supplier_id: string | null;
  supplier?: Supplier;
  notes: string;
  created_at: string;
}

export interface SKU {
  id: string;
  frame_model_id: string;
  frame_model?: FrameModel;
  color_code: string;
  size: string;
  plt_cost_price: number;
  plt_selling_price: number;
  created_at: string;
}

export interface OutletSKUPrice {
  id: string;
  sku_id: string;
  outlet_id: string;
  cost_price: number;
  selling_price: number;
}

export interface StockBalance {
  id: string;
  outlet_id: string;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  quantity: number;
  low_stock_threshold: number;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  outlet_id: string;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  movement_type: MovementType;
  quantity: number;
  reference_id: string | null;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface DailyAdjustment {
  id: string;
  outlet_id: string;
  date: string;
  submitted_by: string;
  notes: string;
  created_at: string;
  items?: DailyAdjustmentItem[];
}

export interface DailyAdjustmentItem {
  id: string;
  adjustment_id: string;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  opening_qty: number;
  stock_in: number;
  stock_out: number;
  closing_qty: number;
}

export interface Transfer {
  id: string;
  from_outlet_id: string;
  to_outlet_id: string;
  to_outlet?: Outlet;
  status: TransferStatus;
  invoice_number: string;
  invoice_pdf_url: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  confirmed_at: string | null;
  received_at: string | null;
  items?: TransferItem[];
}

export interface TransferItem {
  id: string;
  transfer_id: string;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  quantity: number;
  plt_cost_price: number;
  outlet_cost_price: number;
  plt_selling_price: number;
  outlet_selling_price: number;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  supplier?: Supplier;
  status: POStatus;
  do_document_url: string | null;
  notes: string;
  po_number: string;
  created_by: string;
  created_at: string;
  received_at: string | null;
  items?: POItem[];
}

export interface POItem {
  id: string;
  po_id: string;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  quantity: number;
  cost_price: number;
}

export interface Complaint {
  id: string;
  outlet_id: string;
  outlet?: Outlet;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  reference_number: string;
  complaint_type: ComplaintType;
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

export interface Alert {
  id: string;
  outlet_id: string;
  outlet?: Outlet;
  sku_id: string;
  sku?: SKU & { frame_model: FrameModel };
  alert_type: 'low_stock';
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface StockSummary {
  outlet_id: string;
  outlet_name: string;
  total_skus: number;
  total_qty: number;
  low_stock_count: number;
  total_cost_value: number;
  by_type: Record<FrameType, number>;
  by_category: Record<Category, number>;
}
