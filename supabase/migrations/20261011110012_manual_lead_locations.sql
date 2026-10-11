ALTER TABLE public.crm_leads ADD COLUMN location text NOT NULL DEFAULT '' CHECK(length(location)<=180);
CREATE INDEX crm_manual_lead_pool_idx ON public.crm_leads(created_at,id) WHERE source='manual' AND removed_at IS NULL AND status='new';
