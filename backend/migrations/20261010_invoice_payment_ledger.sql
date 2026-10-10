create table if not exists public.crm_invoice_payments (
 id bigint generated always as identity primary key,
 invoice_id bigint not null references public.crm_invoices(id),
 amount numeric(12,2) not null check(amount>0),
 reference text not null check(length(reference) between 3 and 120),
 note text not null default '',
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 unique(invoice_id,reference)
);
alter table public.crm_invoice_payments enable row level security;
revoke all on public.crm_invoice_payments from anon,authenticated;
revoke all on sequence public.crm_invoice_payments_id_seq from anon,authenticated;