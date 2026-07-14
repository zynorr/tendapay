CREATE SEQUENCE IF NOT EXISTS tendapay_invoice_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS tendapay_invoices (
  id text PRIMARY KEY,
  number text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS tendapay_invoices_created_at_idx
  ON tendapay_invoices (created_at DESC);

CREATE TABLE IF NOT EXISTS tendapay_payment_transactions (
  transaction_hash text PRIMARY KEY,
  invoice_id text NOT NULL REFERENCES tendapay_invoices (id) ON DELETE CASCADE,
  milestone_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tendapay_payment_transactions_invoice_idx
  ON tendapay_payment_transactions (invoice_id, milestone_id);
