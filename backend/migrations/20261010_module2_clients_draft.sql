-- Module 2 client records and lead conversion foundation.
-- DRAFT ONLY. Review against isolated staging; never auto-run in production.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lead_id uuid UNIQUE REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (char_length(btrim(email)) BETWEEN 3 AND 254),
  phone text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_clients_created_at_idx ON public.crm_clients (created_at DESC,id DESC);
ALTER TABLE public.crm_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_clients FROM PUBLIC,anon,authenticated;
COMMIT;
