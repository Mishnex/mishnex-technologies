BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_client_login_accounts(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,must_change_password boolean NOT NULL DEFAULT true,sessions_valid_after timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.crm_client_login_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_client_login_accounts FROM anon,authenticated;
COMMIT;
