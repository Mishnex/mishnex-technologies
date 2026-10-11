-- The RLS auto-enable event trigger is a database-internal helper.
-- Keep trigger behavior; remove unnecessary public/RPC execution privileges.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated;
COMMIT;
