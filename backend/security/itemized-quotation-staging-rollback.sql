-- Isolated staging only. All inserted test rows are rolled back.
BEGIN;
DO $$
DECLARE actor uuid; customer uuid; quotation bigint; invoice bigint; payment bigint; blocked boolean := false;
BEGIN
 SELECT id INTO actor FROM auth.users LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Staging identity required'; END IF;
 INSERT INTO public.crm_clients(name,email,phone,created_by) VALUES('Itemized rollback test','itemized-test@example.invalid','9999999999',actor) RETURNING id INTO customer;
 INSERT INTO public.crm_quotations(client_id,title,amount,currency,status,created_by,client_name,client_email,client_phone,items,subtotal,discount_amount,advance_percent,share_token_hash,share_expires_at)
 VALUES(customer,'Itemized rollback test',33000,'INR','sent',actor,'Itemized rollback test','itemized-test@example.invalid','9999999999','[{"name":"Website","quantity":2,"unitPrice":15000,"lineTotal":30000},{"name":"Maintenance","quantity":3,"unitPrice":1000,"lineTotal":3000}]',33000,0,30,repeat('0',64),now()+interval '30 days') RETURNING id INTO quotation;
 IF (SELECT sum((j->>'lineTotal')::numeric) FROM public.crm_quotations q,jsonb_array_elements(q.items) j WHERE q.id=quotation)<>33000 THEN RAISE EXCEPTION 'Invalid item totals'; END IF;
 INSERT INTO public.crm_invoices(client_id,quotation_id,amount,currency,status) VALUES(customer,quotation,33000,'INR','issued') RETURNING id INTO invoice;
 UPDATE public.crm_quotations SET payment_invoice_id=invoice,status='accepted' WHERE id=quotation;
 INSERT INTO public.crm_payment_submissions(invoice_id,submitted_by,amount,reference) VALUES(invoice,null,9900,'itemized-test-'||invoice) RETURNING id INTO payment;
 INSERT INTO public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) VALUES(payment,null,'client_link','submitted','Private quotation link submission');
 BEGIN
  INSERT INTO public.crm_payment_audit(submission_id,actor_id,actor_role,action,reason) VALUES(payment,null,'owner','approved','Must not allow anonymous review');
 EXCEPTION WHEN check_violation THEN blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Anonymous payment decision allowed'; END IF;
 IF (SELECT count(*) FROM public.crm_quotations WHERE share_token_hash=repeat('0',64) AND share_expires_at>now() AND status IN ('sent','accepted'))<>1 THEN RAISE EXCEPTION 'Share scope invalid'; END IF;
 UPDATE public.crm_quotations SET share_expires_at=now()-interval '1 second' WHERE id=quotation;
 IF EXISTS(SELECT 1 FROM public.crm_quotations WHERE id=quotation AND share_token_hash=repeat('0',64) AND share_expires_at>now()) THEN RAISE EXCEPTION 'Expired link available'; END IF;
END $$;
ROLLBACK;
