-- Private ingestion receipts make provider retries idempotent.
create table public.crm_lead_ingestion_events (
 source text not null check(source in ('facebook','instagram','integration')),
 external_id text not null check(length(external_id) between 1 and 256),
 lead_id uuid not null references public.crm_leads(id),
 received_at timestamptz not null default now(),
 primary key(source,external_id)
);
alter table public.crm_lead_ingestion_events enable row level security;
revoke all on public.crm_lead_ingestion_events from anon,authenticated;
create index crm_lead_phone_lookup on public.crm_leads ((regexp_replace(phone,'[^0-9]','','g'))) where removed_at is null;
