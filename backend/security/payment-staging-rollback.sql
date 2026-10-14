-- Run only on isolated staging; all test data is rolled back.
BEGIN;
DO $$
DECLARE actor uuid; customer uuid; invoice bigint; payment bigint; receipt bigint; duplicate_blocked boolean := false;
BEGIN
 SELECT id INTO actor FROM auth.users LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'A staging Auth identity is required'; END IF;
 INSERT INTO public.crm_clients(name,email,created_by) VALUES('Rollback integration test','rollback-test@example.invalid',actor) RETURNING id INTO customer;
 INSERT INTO public.crm_client_portal_access(client_id,user_id) VALUES(customer,actor);
 INSERT INTO public.crm_invoices(client_id,amount,currency,status) VALUES(customer,100,'INR','issued') RETURNING id INTO invoice;
 INSERT INTO public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) VALUES(invoice,actor,30,'rollback-test-'||invoice) RETURNING id INTO payment;
 INSERT INTO public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) VALUES(payment,actor,'client','submitted','Integration test');
 BEGIN
  INSERT INTO public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) VALUES(invoice,actor,30,'rollback-test-'||invoice);
 EXCEPTION WHEN unique_violation THEN duplicate_blocked := true;
 END;
 IF NOT duplicate_blocked THEN RAISE EXCEPTION 'Duplicate reference accepted'; END IF;
 INSERT INTO public.crm_invoice_payments(invoice_id,amount,reference,note,recorded_by,submission_id) VALUES(invoice,30,'rollback-test-'||invoice,'Bank verified',actor,payment) RETURNING id INTO receipt;
 UPDATE public.crm_invoices SET paid_amount=30,status='part_paid' WHERE id=invoice;
 UPDATE public.crm_payment_submissions SET status='approved',reviewed_by=actor,reviewed_at=now() WHERE id=payment;
 INSERT INTO public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) VALUES(payment,actor,'owner','approved','Bank verified');
 IF (SELECT count(*) FROM public.crm_payment_audit WHERE submission_id=payment)<>2 THEN RAISE EXCEPTION 'Audit missing'; END IF;
 IF (SELECT amount-paid_amount FROM public.crm_invoices WHERE id=invoice)<>70 THEN RAISE EXCEPTION 'Incorrect balance'; END IF;
 IF EXISTS(SELECT 1 FROM public.crm_invoice_payments l JOIN public.crm_invoices i ON i.id=l.invoice_id WHERE l.submission_id=payment AND EXISTS(SELECT 1 FROM public.crm_client_portal_access a WHERE a.client_id=i.client_id AND a.user_id='00000000-0000-0000-0000-000000000001')) THEN RAISE EXCEPTION 'Cross-client receipt exposed'; END IF;
END $$;
ROLLBACK;
