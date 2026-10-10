-- One bank transaction must not be credited twice, even against different invoices.
-- Reconcile any historical duplicate references before applying.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS crm_invoice_payments_bank_reference_unique ON public.crm_invoice_payments(lower(btrim(reference)));
COMMIT;
