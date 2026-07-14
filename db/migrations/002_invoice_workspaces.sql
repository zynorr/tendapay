ALTER TABLE tendapay_invoices
  ADD COLUMN IF NOT EXISTS workspace_id text;

UPDATE tendapay_invoices
SET workspace_id = COALESCE(
  payload->>'workspaceId',
  'ws_2f0b23f53734252bda2277357e97e1517d6b042a'
)
WHERE workspace_id IS NULL;

ALTER TABLE tendapay_invoices
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS tendapay_invoices_workspace_created_idx
  ON tendapay_invoices (workspace_id, created_at DESC);
