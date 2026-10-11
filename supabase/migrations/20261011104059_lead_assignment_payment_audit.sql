alter table public.crm_leads add column created_by uuid, add column removed_at timestamptz, add column removed_by uuid;
create table public.crm_lead_assignments (
 id bigint generated always as identity primary key,
 lead_id uuid not null unique references public.crm_leads(id),
 actor_id uuid not null,
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 outcome text check(outcome in ('connected','no_answer','busy','wrong_number','not_interested','follow_up','converted')),
 remarks text check(length(remarks) between 3 and 2000),
 check ((closed_at is null and remarks is null and outcome is null) or (closed_at is not null and remarks is not null and outcome is not null))
);
create unique index crm_one_open_lead_per_actor on public.crm_lead_assignments(actor_id) where closed_at is null;
create index crm_lead_assignments_actor_time on public.crm_lead_assignments(actor_id,created_at desc);
alter table public.crm_lead_assignments enable row level security;
revoke all on public.crm_lead_assignments from anon,authenticated;
alter table public.crm_payment_audit add column actor_name text, add column actor_code text, add column quotation_id bigint references public.crm_quotations(id), add column quotation_code text, add column retained_until timestamptz not null default (now()+interval '3 months');
update public.crm_payment_audit a set actor_name=case when a.actor_role='owner' then 'Owner' else (select s2.full_name from public.crm_staff s2 where s2.user_id=a.actor_id) end,actor_code=case when a.actor_role='owner' then 'MISH-OWN-000001' else (select s2.employee_code from public.crm_staff s2 where s2.user_id=a.actor_id) end,quotation_id=i.quotation_id,quotation_code=q.quotation_code from public.crm_payment_submissions p join public.crm_invoices i on i.id=p.invoice_id left join public.crm_quotations q on q.id=i.quotation_id left join public.crm_staff s on s.user_id=p.reviewed_by where a.submission_id=p.id;
alter table public.crm_projects add column quotation_id bigint references public.crm_quotations(id);
create index crm_projects_quotation_idx on public.crm_projects(quotation_id) where quotation_id is not null;
alter table public.crm_quotations add column booking_confirmed_at timestamptz, add column completed_at timestamptz;
update public.crm_quotations q set booking_confirmed_at=now() where exists(select 1 from public.crm_invoices i where i.quotation_id=q.id and i.paid_amount>0);
create function public.crm_sync_booking_progress() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_TABLE_NAME='crm_invoices' then
  if NEW.paid_amount>0 and NEW.quotation_id is not null then update public.crm_quotations set booking_confirmed_at=coalesce(booking_confirmed_at,now()) where id=NEW.quotation_id; end if;
 else
  if NEW.quotation_id is not null then
   update public.crm_quotations set completed_at=case when exists(select 1 from public.crm_projects p where p.quotation_id=NEW.quotation_id and p.status='completed') and not exists(select 1 from public.crm_projects p where p.quotation_id=NEW.quotation_id and p.status not in ('completed','cancelled')) then coalesce(completed_at,now()) else null end where id=NEW.quotation_id;
  end if;
 end if;
 return NEW;
end $$;
create trigger crm_invoice_booking after insert or update of paid_amount on public.crm_invoices for each row execute function public.crm_sync_booking_progress();
create trigger crm_project_delivery after insert or update of status on public.crm_projects for each row execute function public.crm_sync_booking_progress();

create function public.crm_validate_project_quote() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.quotation_id is not null and not exists(select 1 from public.crm_quotations q where q.id=NEW.quotation_id and q.client_id=NEW.client_id and q.status='accepted') then raise exception 'Project quotation must be accepted and belong to the same client' using errcode='23514'; end if;
 if TG_OP='UPDATE' and OLD.quotation_id is distinct from NEW.quotation_id then raise exception 'Project quotation link is immutable' using errcode='23514'; end if;
 return NEW;
end $$;
create trigger crm_validate_project_quote before insert or update of quotation_id,client_id on public.crm_projects for each row execute function public.crm_validate_project_quote();
create table public.crm_enquiry_mail_outbox (
 lead_id uuid primary key references public.crm_leads(id),
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),
 leased_until timestamptz,sent_at timestamptz,last_error text
);
alter table public.crm_enquiry_mail_outbox enable row level security;
revoke all on public.crm_enquiry_mail_outbox from anon,authenticated;
create index crm_enquiry_mail_pending on public.crm_enquiry_mail_outbox(next_attempt_at) where sent_at is null;
create function public.crm_queue_enquiry_email() returns trigger language plpgsql set search_path='' as $$
begin
 if NEW.source='website' then insert into public.crm_enquiry_mail_outbox(lead_id) values(NEW.id); end if;
 return NEW;
end $$;
create trigger crm_queue_enquiry_email after insert on public.crm_leads for each row execute function public.crm_queue_enquiry_email();
