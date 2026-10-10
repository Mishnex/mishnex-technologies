-- Isolated staging only. All fixture accounts/session changes roll back.
BEGIN;
DO $$
DECLARE actor uuid; user_id uuid; first_user uuid; account_blocked boolean:=false; i integer; accepted boolean;
BEGIN
 SELECT id INTO actor FROM auth.users LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Staging Auth identity required'; END IF;
 UPDATE public.crm_staff SET is_active=false WHERE role='super_admin';
 UPDATE public.crm_super_admin_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
 FOR i IN 1..5 LOOP
  user_id:=gen_random_uuid();IF i=1 THEN first_user:=user_id;END IF;
  INSERT INTO auth.users(id,email) VALUES(user_id,'caps-rollback-'||user_id||'@example.invalid');
  INSERT INTO public.crm_staff(user_id,email,full_name,role,is_active,must_change_password,created_by) VALUES(user_id,'caps-rollback-'||user_id||'@example.invalid','Cap rollback test','super_admin',true,false,actor);
 END LOOP;
 user_id:=gen_random_uuid();INSERT INTO auth.users(id,email) VALUES(user_id,'caps-rollback-'||user_id||'@example.invalid');
 BEGIN
  INSERT INTO public.crm_staff(user_id,email,full_name,role,is_active,must_change_password,created_by) VALUES(user_id,'caps-rollback-'||user_id||'@example.invalid','Sixth cap test','super_admin',true,false,actor);
 EXCEPTION WHEN raise_exception THEN account_blocked:=true;
 END;
 IF NOT account_blocked THEN RAISE EXCEPTION 'Sixth Super Admin account accepted'; END IF;
 FOR i IN 1..5 LOOP
  accepted:=public.crm_register_super_admin_session(first_user,repeat(md5('caps-test-'||i),2),now()+interval '1 hour');
  IF NOT accepted THEN RAISE EXCEPTION 'Session % unexpectedly denied',i; END IF;
 END LOOP;
 IF public.crm_register_super_admin_session(first_user,repeat(md5('caps-test-sixth'),2),now()+interval '1 hour') THEN RAISE EXCEPTION 'Sixth concurrent session accepted'; END IF;
 UPDATE public.crm_super_admin_sessions SET revoked_at=now() WHERE token_fingerprint=repeat(md5('caps-test-1'),2);
 IF NOT public.crm_register_super_admin_session(first_user,repeat(md5('caps-test-replacement'),2),now()+interval '1 hour') THEN RAISE EXCEPTION 'Revoked session did not release capacity'; END IF;
 IF public.crm_register_super_admin_session(first_user,repeat(md5('caps-test-replacement'),2),now()+interval '1 hour') THEN RAISE EXCEPTION 'Duplicate fingerprint accepted'; END IF;
 UPDATE public.crm_staff s SET is_active=false WHERE s.user_id=first_user;
 IF public.crm_register_super_admin_session(first_user,repeat(md5('caps-test-disabled'),2),now()+interval '1 hour') THEN RAISE EXCEPTION 'Deactivated Super Admin session accepted'; END IF;
END $$;
ROLLBACK;
