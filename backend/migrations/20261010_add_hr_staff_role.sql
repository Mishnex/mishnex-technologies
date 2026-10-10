ALTER TABLE public.crm_staff DROP CONSTRAINT IF EXISTS crm_staff_role_check;
ALTER TABLE public.crm_staff ADD CONSTRAINT crm_staff_role_check CHECK (role = ANY (ARRAY['super_admin','manager','sales','developer','accountant','hr']));
