-- TorTracker v2 Migration
-- Run in Supabase SQL Editor BEFORE deploying the updated app

-- Reason tracking for daily adjustment items
ALTER TABLE daily_adjustment_items
  ADD COLUMN IF NOT EXISTS stock_out_reason TEXT,
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS stock_in_remarks TEXT;

-- Payment tracking for purchase orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payment_date DATE;
