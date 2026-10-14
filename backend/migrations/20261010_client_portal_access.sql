create table if not exists public.crm_client_portal_access (
 client_id uuid not null references public.crm_clients(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(client_id,user_id)
);
create index if not exists crm_client_portal_access_user_idx on public.crm_client_portal_access(user_id);
alter table public.crm_client_portal_access enable row level security;
revoke all on public.crm_client_portal_access from anon,authenticated;