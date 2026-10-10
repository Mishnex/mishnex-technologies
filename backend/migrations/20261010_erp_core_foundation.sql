CREATE TABLE IF NOT EXISTS public.crm_projects (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, client_id uuid REFERENCES public.crm_clients(id),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 180), description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','on_hold','completed','cancelled')),
 due_date date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_project_tasks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, project_id bigint NOT NULL REFERENCES public.crm_projects(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
 assignee uuid REFERENCES public.crm_staff(user_id), status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','done')),
 due_date date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_quotations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, client_id uuid REFERENCES public.crm_clients(id),
 title text NOT NULL, amount numeric(12,2) NOT NULL CHECK(amount>=0),
 currency char(3) NOT NULL DEFAULT 'INR', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_invoices (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, client_id uuid NOT NULL REFERENCES public.crm_clients(id),
 quotation_id bigint REFERENCES public.crm_quotations(id), amount numeric(12,2) NOT NULL CHECK(amount>=0),
 paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(paid_amount>=0 AND paid_amount<=amount),
 currency char(3) NOT NULL DEFAULT 'INR', due_date date,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','part_paid','paid','void')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_website_content (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, page_key text NOT NULL, section_key text NOT NULL,
 content jsonb NOT NULL DEFAULT '{}'::jsonb, updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(page_key,section_key)
);
ALTER TABLE public.crm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_website_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_projects,public.crm_project_tasks,public.crm_quotations,public.crm_invoices,public.crm_website_content FROM anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;