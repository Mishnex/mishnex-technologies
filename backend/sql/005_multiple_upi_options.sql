BEGIN;
ALTER TABLE public.crm_business_policy ADD COLUMN IF NOT EXISTS upi_secondary_id text NOT NULL DEFAULT '';
ALTER TABLE public.crm_business_policy ADD COLUMN IF NOT EXISTS upi_receiver_name text NOT NULL DEFAULT '';
COMMIT;
