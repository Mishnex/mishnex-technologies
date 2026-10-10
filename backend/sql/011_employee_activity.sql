BEGIN;
CREATE TABLE public.crm_staff_call_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 lead_id uuid NOT NULL REFERENCES public.crm_leads(id),
 request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('call','follow_up')),
 outcome text NOT NULL CHECK(outcome IN ('connected','no_answer','busy','wrong_number','not_interested','follow_up')),
 duration_seconds integer NOT NULL DEFAULT 0 CHECK(duration_seconds BETWEEN 0 AND 86400),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 3 AND 2000),
 next_follow_up date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(actor_id,request_id)
);
CREATE INDEX crm_staff_call_actor_time ON public.crm_staff_call_activity(actor_id,created_at DESC);
CREATE INDEX crm_staff_call_lead_time ON public.crm_staff_call_activity(lead_id,created_at DESC);
CREATE TABLE public.crm_staff_work_activity (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 resource text NOT NULL CHECK(resource IN ('projects','tasks','invoices','quotations')),
 record_id bigint NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_staff_work_actor_time ON public.crm_staff_work_activity(actor_id,created_at DESC);
ALTER TABLE public.crm_staff_call_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_staff_work_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_staff_call_activity,public.crm_staff_work_activity FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.crm_staff_call_activity_id_seq,public.crm_staff_work_activity_id_seq FROM PUBLIC,anon,authenticated;
COMMIT;
