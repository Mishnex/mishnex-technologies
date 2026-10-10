BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_business_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 advance_percent numeric(5,2) NOT NULL DEFAULT 30 CHECK(advance_percent BETWEEN 0 AND 100),
 upi_id text NOT NULL DEFAULT '', quotation_floors jsonb NOT NULL DEFAULT '{"INR":0,"USD":0,"EUR":0,"GBP":0}',
 updated_by uuid REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.crm_business_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 100);
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.crm_quotations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
ALTER TABLE public.crm_business_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_business_policy FROM anon,authenticated;
COMMIT;
