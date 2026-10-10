-- Module 2: lead workflow foundation. REVIEW ONLY; do not apply to production automatically.
-- Execute only after confirming the crm_leads table schema in isolated staging.
BEGIN;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new';

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_status_check;

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_status_check
  CHECK (status IN ('new','contacted','qualified','proposal','won','lost','closed'));

CREATE TABLE IF NOT EXISTS public.crm_lead_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  from_status text NOT NULL CHECK (from_status IN ('new','contacted','qualified','proposal','won','lost','closed')),
  to_status text NOT NULL CHECK (to_status IN ('new','contacted','qualified','proposal','won','lost','closed')),
  note text CHECK (note IS NULL OR (char_length(btrim(note)) BETWEEN 1 AND 2000)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_lead_activity_lead_created_idx
  ON public.crm_lead_activity (lead_id, created_at DESC);

ALTER TABLE public.crm_lead_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_lead_activity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.crm_lead_activity_id_seq FROM PUBLIC, anon, authenticated;

COMMIT;
