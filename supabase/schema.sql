-- ============================================================
-- TorTracker Database Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================

-- OUTLETS
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- SS2, KD, CHR, PLT
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO outlets (code, name) VALUES
  ('PLT', 'PLT HQ'),
  ('SS2', 'SS2 Outlet'),
  ('KD', 'Kota Damansara'),
  ('CHR', 'Cheras Outlet');

-- USERS
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- base64(password) for demo; use Edge Function + bcrypt in production
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('boss', 'joey', 'pic', 'admin')),
  outlet_id UUID REFERENCES outlets(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed users (password_hash = btoa('password123') = 'cGFzc3dvcmQxMjM=')
-- Change passwords IMMEDIATELY after first login!
INSERT INTO users (username, password_hash, name, role, outlet_id) VALUES
  ('boss',    encode('boss1234'::bytea, 'base64'),     'Boss',    'boss',  NULL),
  ('joey',    encode('joey1234'::bytea, 'base64'),     'Joey',    'joey',  (SELECT id FROM outlets WHERE code='PLT')),
  ('plt1',    encode('plt11234'::bytea, 'base64'),     'PLT Admin 1', 'admin', (SELECT id FROM outlets WHERE code='PLT')),
  ('plt2',    encode('plt21234'::bytea, 'base64'),     'PLT Admin 2', 'admin', (SELECT id FROM outlets WHERE code='PLT')),
  ('kk',      encode('kk001234'::bytea, 'base64'),     'KK',      'pic',   (SELECT id FROM outlets WHERE code='SS2')),
  ('ss2admin',encode('ss2a1234'::bytea, 'base64'),     'SS2 Admin','admin', (SELECT id FROM outlets WHERE code='SS2')),
  ('raymond', encode('ray01234'::bytea, 'base64'),     'Raymond', 'pic',   (SELECT id FROM outlets WHERE code='CHR')),
  ('chradmin',encode('chra1234'::bytea, 'base64'),     'CHR Admin','admin', (SELECT id FROM outlets WHERE code='CHR')),
  ('kc',      encode('kc001234'::bytea, 'base64'),     'KC',      'pic',   (SELECT id FROM outlets WHERE code='KD')),
  ('kdadmin', encode('kdad1234'::bytea, 'base64'),     'KD Admin', 'admin', (SELECT id FROM outlets WHERE code='KD'));

-- SUPPLIERS
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  contact TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FRAME MODELS
CREATE TABLE frame_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model_code TEXT UNIQUE NOT NULL,
  frame_type TEXT NOT NULL CHECK (frame_type IN ('Sports','Titanium','Lightweight','Clip On','Plastic')),
  category TEXT NOT NULL CHECK (category IN ('Frame','Sunglass')),
  supplier_id UUID REFERENCES suppliers(id),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SKUS (model + color + size variants)
CREATE TABLE skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_model_id UUID NOT NULL REFERENCES frame_models(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,
  size TEXT NOT NULL,
  plt_cost_price NUMERIC(10,2) DEFAULT 0,
  plt_selling_price NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(frame_model_id, color_code, size)
);

-- OUTLET SKU PRICES (each outlet has its own cost & selling price)
CREATE TABLE outlet_sku_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  cost_price NUMERIC(10,2) DEFAULT 0,
  selling_price NUMERIC(10,2) DEFAULT 0,
  UNIQUE(sku_id, outlet_id)
);

-- STOCK BALANCE (current quantity per outlet per sku)
CREATE TABLE stock_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(outlet_id, sku_id)
);

-- STOCK MOVEMENTS (audit trail)
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  sku_id UUID NOT NULL REFERENCES skus(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in','out','transfer_in','transfer_out','adjustment')),
  quantity INTEGER NOT NULL,
  reference_id UUID,
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- DAILY ADJUSTMENTS
CREATE TABLE daily_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  date DATE NOT NULL,
  submitted_by TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES daily_adjustments(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  opening_qty INTEGER NOT NULL,
  stock_in INTEGER NOT NULL DEFAULT 0,
  stock_out INTEGER NOT NULL DEFAULT 0,
  closing_qty INTEGER NOT NULL
);

-- TRANSFERS (PLT → Outlets)
CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_outlet_id UUID NOT NULL REFERENCES outlets(id),
  to_outlet_id UUID NOT NULL REFERENCES outlets(id),
  status TEXT NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('draft','pending_confirmation','delivered','received')),
  invoice_number TEXT UNIQUE NOT NULL,
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ
);

CREATE TABLE transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  quantity INTEGER NOT NULL,
  plt_cost_price NUMERIC(10,2) DEFAULT 0,
  outlet_cost_price NUMERIC(10,2) DEFAULT 0,
  plt_selling_price NUMERIC(10,2) DEFAULT 0,
  outlet_selling_price NUMERIC(10,2) DEFAULT 0
);

-- PURCHASE ORDERS (supplier → PLT or outlet)
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','partial')),
  po_number TEXT UNIQUE NOT NULL,
  do_document_url TEXT,
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  received_at TIMESTAMPTZ
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  quantity INTEGER NOT NULL,
  cost_price NUMERIC(10,2) DEFAULT 0
);

-- QUALITY COMPLAINTS
CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  sku_id UUID NOT NULL REFERENCES skus(id),
  reference_number TEXT UNIQUE NOT NULL,
  complaint_type TEXT NOT NULL,
  description TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  photo_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved')),
  reviewed_by TEXT,
  review_notes TEXT,
  is_manufacturer_defect BOOLEAN DEFAULT FALSE,
  warranty_claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ALERTS
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  sku_id UUID NOT NULL REFERENCES skus(id),
  alert_type TEXT NOT NULL DEFAULT 'low_stock',
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(outlet_id, sku_id, alert_type)
);

-- INDEXES for performance
CREATE INDEX idx_stock_balance_outlet ON stock_balance(outlet_id);
CREATE INDEX idx_stock_movements_outlet ON stock_movements(outlet_id);
CREATE INDEX idx_stock_movements_created ON stock_movements(created_at);
CREATE INDEX idx_alerts_outlet ON alerts(outlet_id);
CREATE INDEX idx_alerts_unread ON alerts(outlet_id, is_read);
CREATE INDEX idx_complaints_outlet ON complaints(outlet_id);
CREATE INDEX idx_transfers_from ON transfers(from_outlet_id);
CREATE INDEX idx_transfers_to ON transfers(to_outlet_id);

-- ============================================================
-- ROW LEVEL SECURITY (optional, enable if needed)
-- For simplicity, enable public access and control via app logic
-- In production, you'd add proper RLS policies per role
-- ============================================================

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE frame_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_sku_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Allow all operations via anon key (app controls access via login)
-- In production, replace with role-based policies
CREATE POLICY "Allow all" ON outlets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON frame_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON skus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON outlet_sku_prices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_balance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON daily_adjustments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON daily_adjustment_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON transfer_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON complaints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON alerts FOR ALL USING (true) WITH CHECK (true);
