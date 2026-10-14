BEGIN;
DO $$
DECLARE actor uuid; customer uuid; quote bigint; invoice bigint; submission bigint;
BEGIN
 SELECT id INTO actor FROM auth.users LIMIT 1;
 INSERT INTO public.crm_clients(name,email,created_by) VALUES('Advance rollback test','advance-test@example.invalid',actor) RETURNING id INTO customer;
 INSERT INTO public.crm_quotations(client_id,title,amount,currency,status,created_by,advance_percent,advance_amount) VALUES(customer,'Advance rollback test',100,'INR','sent',actor,30,50) RETURNING id INTO quote;
 INSERT INTO public.crm_payment_control_audit(quotation_id,actor_id,actor_role,before_value,after_value,reason) VALUES(quote,actor,'owner','{"advancePercent":30}','{"advanceAmount":50}','Staging rollback test');
 IF (SELECT advance_amount FROM public.crm_quotations WHERE id=quote)<>50 THEN RAISE EXCEPTION 'Fixed advance not saved';END IF;
 BEGIN
  UPDATE public.crm_quotations SET advance_amount=101 WHERE id=quote;
  RAISE EXCEPTION 'Excessive advance accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 INSERT INTO public.crm_invoices(client_id,quotation_id,amount,currency,status) VALUES(customer,quote,100,'INR','issued') RETURNING id INTO invoice;
 INSERT INTO public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) VALUES(invoice,actor,50,'advance-rollback-'||invoice) RETURNING id INTO submission;
 IF NOT EXISTS(SELECT 1 FROM public.crm_invoices i WHERE i.quotation_id=quote AND (i.paid_amount>0 OR EXISTS(SELECT 1 FROM public.crm_payment_submissions p WHERE p.invoice_id=i.id))) THEN RAISE EXCEPTION 'Started payment not detected'; END IF;
 INSERT INTO public.crm_client_login_accounts(user_id,created_by) VALUES(actor,actor);
 IF NOT (SELECT must_change_password FROM public.crm_client_login_accounts WHERE user_id=actor) THEN RAISE EXCEPTION 'First password change is not required'; END IF;
END $$;
ROLLBACK;
