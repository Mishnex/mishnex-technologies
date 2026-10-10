-- Display-code format change. Primary keys, allocated numbers and relationships stay intact.
BEGIN;
ALTER TABLE public.crm_staff ADD COLUMN employee_prefix text;
UPDATE public.crm_staff SET employee_prefix=CASE role
 WHEN 'sales' THEN 'MISH-SL' WHEN 'super_admin' THEN 'MISH-SA'
 WHEN 'hr' THEN 'MISH-HR' WHEN 'developer' THEN 'MISH-DV'
 WHEN 'manager' THEN 'MISH-MG' WHEN 'accountant' THEN 'MISH-AC' ELSE 'MISH-EMP' END;
ALTER TABLE public.crm_staff ALTER COLUMN employee_prefix SET NOT NULL;
ALTER TABLE public.crm_staff ADD CONSTRAINT crm_staff_employee_prefix_check CHECK(employee_prefix IN ('MISH-SL','MISH-SA','MISH-HR','MISH-DV','MISH-MG','MISH-AC','MISH-EMP'));
ALTER TABLE public.crm_staff DROP CONSTRAINT crm_staff_employee_code_unique;
ALTER TABLE public.crm_staff DROP COLUMN employee_code;
ALTER TABLE public.crm_staff ADD COLUMN employee_code text GENERATED ALWAYS AS
 (employee_prefix || '-' || lpad(employee_number::text,greatest(6,length(employee_number::text)),'0')) STORED;
ALTER TABLE public.crm_staff ADD CONSTRAINT crm_staff_employee_code_unique UNIQUE(employee_code);
CREATE FUNCTION public.crm_staff_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.employee_prefix := CASE NEW.role
   WHEN 'sales' THEN 'MISH-SL' WHEN 'super_admin' THEN 'MISH-SA'
   WHEN 'hr' THEN 'MISH-HR' WHEN 'developer' THEN 'MISH-DV'
   WHEN 'manager' THEN 'MISH-MG' WHEN 'accountant' THEN 'MISH-AC' ELSE 'MISH-EMP' END;
 ELSIF NEW.employee_prefix IS DISTINCT FROM OLD.employee_prefix OR NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
  RAISE EXCEPTION 'Employee display identity cannot be changed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_staff_identity_guard BEFORE INSERT OR UPDATE ON public.crm_staff FOR EACH ROW EXECUTE FUNCTION public.crm_staff_identity_guard();
REVOKE ALL ON FUNCTION public.crm_staff_identity_guard() FROM PUBLIC,anon,authenticated;
ALTER TABLE public.crm_clients DROP CONSTRAINT crm_clients_client_code_unique;
ALTER TABLE public.crm_clients DROP COLUMN client_code;
ALTER TABLE public.crm_clients ADD COLUMN client_code text GENERATED ALWAYS AS
 ('MISH-CL-' || lpad(client_number::text,greatest(6,length(client_number::text)),'0')) STORED;
ALTER TABLE public.crm_clients ADD CONSTRAINT crm_clients_client_code_unique UNIQUE(client_code);
ALTER TABLE public.crm_quotations DROP CONSTRAINT crm_quotations_quotation_code_unique;
ALTER TABLE public.crm_quotations DROP COLUMN quotation_code;
ALTER TABLE public.crm_quotations ADD COLUMN quotation_code text GENERATED ALWAYS AS
 ('MISH-QT-' || lpad(id::text,greatest(6,length(id::text)),'0')) STORED;
ALTER TABLE public.crm_quotations ADD CONSTRAINT crm_quotations_quotation_code_unique UNIQUE(quotation_code);
COMMIT;
