-- Migration v3: Add SKU status for active/discontinued tracking
ALTER TABLE skus ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status);
