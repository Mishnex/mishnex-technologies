-- Apply to isolated staging first. Production rollout requires Owner approval.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_payment_review_grants (
 user_id uuid PRIMARY KEY REFERENCES public.crm_staff(user_id),
 granted_by uuid NOT NULL REFERENCES auth.users(id), granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_payment_submissions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 invoice_id bigint NOT NULL REFERENCES public.crm_invoices(id),
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 amount numeric(12,2) NOT NULL CHECK(amount>0),
 reference text NOT NULL CHECK(length(reference) BETWEEN 3 AND 120),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 reason text NOT NULL DEFAULT '', reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(invoice_id,reference)
);
CREATE TABLE IF NOT EXISTS public.crm_payment_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 submission_id bigint NOT NULL REFERENCES public.crm_payment_submissions(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), actor_role text NOT NULL,
 action text NOT NULL CHECK(action IN ('submitted','approved','rejected','reopened')),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_invoice_payments ADD COLUMN IF NOT EXISTS submission_id bigint UNIQUE REFERENCES public.crm_payment_submissions(id);
CREATE INDEX IF NOT EXISTS crm_payment_submissions_status_idx ON public.crm_payment_submissions(status,id);
CREATE INDEX IF NOT EXISTS crm_payment_audit_submission_idx ON public.crm_payment_audit(submission_id,id);
ALTER TABLE public.crm_payment_review_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_payment_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_payment_review_grants,public.crm_payment_submissions,public.crm_payment_audit FROM anon,authenticated;
REVOKE ALL ON SEQUENCE public.crm_payment_submissions_id_seq,public.crm_payment_audit_id_seq FROM anon,authenticated;
COMMIT;
