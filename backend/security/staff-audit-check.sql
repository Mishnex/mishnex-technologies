-- Read-only audit schema and recent action summary.
-- Never select detail JSON or user identifiers into shared diagnostics.
select
  count(*) filter (where column_name='actor_id' and is_nullable='NO') = 1 as actor_required,
  count(*) filter (where column_name='action' and is_nullable='NO') = 1 as action_required,
  count(*) filter (where column_name='created_at' and is_nullable='NO') = 1 as timestamp_required,
  count(*) filter (where column_name='detail' and data_type='jsonb' and is_nullable='NO') = 1 as structured_detail_required
from information_schema.columns
where table_schema='public' and table_name='crm_staff_audit';

-- Aggregated counts only; no sensitive audit payloads.
select action, count(*) as events
from public.crm_staff_audit
group by action
order by action;

-- Always returns a single summary row, even when the audit table is empty.
select count(*) as total_events,
       count(*) filter (where action='staff_created') as staff_created_events,
       count(*) filter (where action='staff_password_reset') as password_reset_events,
       count(*) filter (where action='staff_deactivated') as deactivation_events
from public.crm_staff_audit;

-- Session and self-service password security events, aggregate-only.
select
  count(*) filter (where action='staff_password_change_started') as password_change_started,
  count(*) filter (where action='staff_password_changed') as password_change_completed,
  count(*) filter (where action='staff_logout') as staff_logout_events
from public.crm_staff_audit;
