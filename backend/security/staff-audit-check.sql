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
