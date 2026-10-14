BEGIN;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS client_email text;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS subtotal numeric(12,2);
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS advance_percent numeric(5,2) NOT NULL DEFAULT 30;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS share_token_hash text UNIQUE;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS share_expires_at timestamptz;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS payment_invoice_id bigint UNIQUE REFERENCES public.crm_invoices(id);
ALTER TABLE public.crm_payment_submissions ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE public.crm_payment_audit ALTER COLUMN actor_id DROP NOT NULL;
-- Shared-link submission has no login identity; reviews still require an authenticated actor.
ALTER TABLE public.crm_payment_audit ADD CONSTRAINT crm_payment_audit_actor_required CHECK(actor_id IS NOT NULL OR (actor_role='client_link' AND action='submitted'));
COMMIT;
