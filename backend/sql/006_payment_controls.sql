BEGIN;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS advance_amount numeric(12,2) CHECK(advance_amount>=0 AND advance_amount<=amount);
CREATE TABLE IF NOT EXISTS public.crm_payment_control_audit (
 id bigserial PRIMARY KEY,quotation_id bigint REFERENCES public.crm_quotations(id),actor_id uuid NOT NULL REFERENCES auth.users(id),actor_role text NOT NULL CHECK(actor_role IN ('owner','super_admin')),before_value jsonb NOT NULL,after_value jsonb NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_payment_control_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_payment_control_audit FROM anon,authenticated;
COMMIT;
