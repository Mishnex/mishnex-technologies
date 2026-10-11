BEGIN;
ALTER TABLE public.crm_business_policy ADD COLUMN seller_gst_number text CHECK(seller_gst_number IS NULL OR seller_gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
ALTER TABLE public.crm_clients ADD COLUMN gst_number text CHECK(gst_number IS NULL OR gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
ALTER TABLE public.crm_invoices ADD COLUMN client_gst_number text CHECK(client_gst_number IS NULL OR client_gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
ALTER TABLE public.crm_invoices ADD COLUMN seller_gst_number text CHECK(seller_gst_number IS NULL OR seller_gst_number ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
ALTER TABLE public.crm_invoices ADD COLUMN delivery_cost numeric(12,2) CHECK(delivery_cost>=0);
CREATE TABLE public.crm_invoice_detail_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invoice_id bigint NOT NULL REFERENCES public.crm_invoices(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 actor_role text NOT NULL CHECK(actor_role IN ('owner','super_admin')),
 previous_details jsonb NOT NULL,new_details jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_invoice_detail_audit_invoice ON public.crm_invoice_detail_audit(invoice_id,id DESC);
ALTER TABLE public.crm_invoice_detail_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_invoice_detail_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.crm_invoice_detail_audit_id_seq FROM PUBLIC,anon,authenticated;
COMMIT;
