-- Read-only Super Admin session policy verification.
-- Run against the intended Supabase project with an authorized SQL editor.
-- No staff accounts or sessions are created.
select
  (select count(*) from public.crm_staff
   where role='super_admin' and is_active) as active_super_admin_accounts,
  (select count(*) from public.crm_super_admin_sessions
   where revoked_at is null and expires_at > now()) as active_super_admin_sessions,
  (select count(*) from public.crm_super_admin_sessions
   where revoked_at is null and expires_at > now()
   group by token_fingerprint having count(*) > 1 limit 1) as duplicate_active_fingerprints,
  (select count(*) from public.crm_super_admin_sessions s
   left join public.crm_staff st on st.user_id=s.user_id
   where s.revoked_at is null and s.expires_at > now()
     and (st.user_id is null or not st.is_active or st.role <> 'super_admin')) as invalid_active_session_owners;
