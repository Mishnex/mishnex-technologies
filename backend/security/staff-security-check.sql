-- Read-only CRM security verification. Safe to run on staging or production.
-- Expected: rls_tables=3, readable_tables=0, exposed_functions=0,
-- active_super_admin_sessions <= 5. Includes pre-change session revocation function.
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('crm_staff','crm_staff_audit','crm_super_admin_sessions')
    and c.relrowsecurity) as rls_tables,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('crm_staff','crm_staff_audit','crm_super_admin_sessions')
    and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))) as readable_tables,
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('crm_register_super_admin_session','crm_complete_staff_password_change','crm_revoke_staff_sessions_on_logout','crm_begin_staff_password_change')
    and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))) as exposed_functions,
 (select count(*) from public.crm_super_admin_sessions where revoked_at is null and expires_at>now()) as active_super_admin_sessions;

-- A boolean summary makes regressions visible without exposing staff data.
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('crm_staff','crm_staff_audit','crm_super_admin_sessions')
    and c.relrowsecurity) = 3 as staff_rls_ok,
 not exists (
   select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('crm_staff','crm_staff_audit','crm_super_admin_sessions')
     and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))
 ) as staff_table_read_permissions_ok,
 not exists (
   select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
     ('crm_register_super_admin_session','crm_complete_staff_password_change','crm_revoke_staff_sessions_on_logout','crm_begin_staff_password_change')
     and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
 ) as staff_function_execute_permissions_ok;

-- RLS enabled on all three sensitive tables; FORCE RLS is reported separately
-- because privileged service connections may intentionally bypass RLS.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('crm_staff','crm_staff_audit','crm_super_admin_sessions')
order by c.relname;

-- Confirm all four sensitive functions actually exist, not just that
-- existing functions deny direct execution to public API roles.
select
  count(distinct p.proname) = 4 as required_functions_present,
  count(distinct p.proname) as required_functions_found
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'crm_register_super_admin_session',
    'crm_complete_staff_password_change',
    'crm_revoke_staff_sessions_on_logout',
    'crm_begin_staff_password_change'
  );
