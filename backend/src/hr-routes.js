import { Router } from 'express';
import { z } from 'zod';
import { permissionsFor } from './staff-permissions.js';
import { tokenIssuedAfterCutoff } from './staff-session.js';

export function hrRoutes({pool,requireOwner}) {
 const router=Router();
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 async function authorize(req,res,next) {
  const bearer=/^Bearer (\S+)$/.exec(req.get('Authorization')||'');
  if(!bearer)return res.status(401).json({error:'Sign in required.'});
  try {
   const auth=await fetch(new URL('/auth/v1/user',process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_ANON_KEY,Authorization:'Bearer '+bearer[1]},signal:AbortSignal.timeout(8000)});
   if(!auth.ok)return res.status(401).json({error:'Invalid session.'});
   const user=await auth.json();
   if(user.id===process.env.OWNER_USER_ID){req.hrActor={id:user.id,owner:true};return next()}
   const result=await pool.query('select user_id,role,is_active,must_change_password,sessions_valid_after from public.crm_staff where user_id=$1',[user.id]);
   const staff=result.rows[0];
   if(!staff?.is_active||staff.must_change_password||!tokenIssuedAfterCutoff(bearer[1],staff.sessions_valid_after))return res.status(403).json({error:'Staff access denied.'});
   req.hrActor={id:user.id,owner:false,permissions:permissionsFor(staff)};
   next();
  }catch(error){next(error)}
 }
 function permit(permission){return (req,res,next)=>req.hrActor.owner||req.hrActor.permissions.includes(permission)?next():res.status(403).json({error:'Insufficient permissions.'})}
 const uuid=z.string().uuid();
 const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
 const profile=z.object({department:z.string().max(100),jobTitle:z.string().max(120),joiningDate:date.nullable().optional(),notes:z.string().max(2000)}).strict();
 const attendance=z.object({staffUserId:uuid,attendanceDate:date,status:z.enum(['present','absent','half_day','on_leave']),notes:z.string().max(500).default('')}).strict();
 const leave=z.object({staffUserId:uuid,startDate:date,endDate:date,reason:z.string().min(2).max(1000)}).strict();
 router.use(authorize);
 router.get('/overview',permit('hr:employees:read'),async(req,res,next)=>{try{
  const result=await pool.query(`select
   (select count(*)::int from public.crm_staff where is_active) as active_employees,
   (select count(*)::int from public.crm_hr_attendance where attendance_date=current_date and status='present') as present_today,
   (select count(*)::int from public.crm_hr_leave_requests where status='pending') as pending_leaves`);
  res.json({overview:result.rows[0]});
 }catch(e){next(e)}});
 router.get('/employees',permit('hr:employees:read'),async(req,res,next)=>{try{
  const result=await pool.query(`select s.user_id,s.full_name,s.email,s.role,s.is_active,p.department,p.job_title,p.joining_date,p.notes from public.crm_staff s left join public.crm_hr_employee_profiles p on p.staff_user_id=s.user_id order by s.created_at desc limit 200`);
  res.json({employees:result.rows});
 }catch(e){next(e)}});
 router.patch('/employees/:id',permit('hr:employees:manage'),async(req,res,next)=>{const id=uuid.safeParse(req.params.id),body=profile.safeParse(req.body);if(!id.success||!body.success)return res.status(400).json({error:'Invalid employee details.'});try{
  const d=body.data;
  const result=await pool.query(`insert into public.crm_hr_employee_profiles(staff_user_id,department,job_title,joining_date,notes)
   select user_id,$2,$3,$4,$5 from public.crm_staff where user_id=$1
   on conflict(staff_user_id) do update set department=excluded.department,job_title=excluded.job_title,joining_date=excluded.joining_date,notes=excluded.notes,updated_at=now() returning *`,[id.data,d.department,d.jobTitle,d.joiningDate||null,d.notes]);
  if(!result.rowCount)return res.status(404).json({error:'Employee not found.'});res.json({profile:result.rows[0]});
 }catch(e){next(e)}});
 router.get('/attendance',permit('hr:attendance:read'),async(req,res,next)=>{try{
  const result=await pool.query(`select a.*,s.full_name from public.crm_hr_attendance a join public.crm_staff s on s.user_id=a.staff_user_id where a.attendance_date>=current_date-interval '60 days' order by a.attendance_date desc,a.id desc limit 300`);
  res.json({attendance:result.rows});
 }catch(e){next(e)}});
 router.post('/attendance',permit('hr:attendance:manage'),async(req,res,next)=>{const parsed=attendance.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid attendance details.'});try{
  const d=parsed.data;
  const result=await pool.query(`insert into public.crm_hr_attendance(staff_user_id,attendance_date,status,notes,recorded_by)
   select user_id,$2,$3,$4,$5 from public.crm_staff where user_id=$1
   on conflict(staff_user_id,attendance_date) do update set status=excluded.status,notes=excluded.notes,recorded_by=excluded.recorded_by,updated_at=now() returning *`,[d.staffUserId,d.attendanceDate,d.status,d.notes,req.hrActor.id]);
  if(!result.rowCount)return res.status(404).json({error:'Employee not found.'});res.status(201).json({attendance:result.rows[0]});
 }catch(e){next(e)}});
 router.get('/leaves',permit('hr:leave:read'),async(req,res,next)=>{try{
  const result=await pool.query(`select l.*,s.full_name from public.crm_hr_leave_requests l join public.crm_staff s on s.user_id=l.staff_user_id order by l.created_at desc limit 200`);
  res.json({leaves:result.rows});
 }catch(e){next(e)}});
 router.post('/leaves',permit('hr:leave:read'),async(req,res,next)=>{const parsed=leave.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Invalid leave request.'});const d=parsed.data;if(d.endDate<d.startDate)return res.status(400).json({error:'End date must follow start date.'});if(!req.hrActor.owner&&d.staffUserId!==req.hrActor.id)return res.status(403).json({error:'Can only request your own leave.'});try{
  const result=await pool.query(`insert into public.crm_hr_leave_requests(staff_user_id,start_date,end_date,reason)
  select user_id,$2,$3,$4 from public.crm_staff where user_id=$1 returning *`,[d.staffUserId,d.startDate,d.endDate,d.reason]);
  if(!result.rowCount)return res.status(404).json({error:'Employee not found.'});res.status(201).json({leave:result.rows[0]});
 }catch(e){next(e)}});
 router.patch('/leaves/:id/decision',permit('hr:leave:approve'),async(req,res,next)=>{const id=z.coerce.number().int().positive().safeParse(req.params.id),body=z.object({status:z.enum(['approved','rejected'])}).strict().safeParse(req.body);if(!id.success||!body.success)return res.status(400).json({error:'Invalid decision.'});try{
  const result=await pool.query(`update public.crm_hr_leave_requests set status=$2,decided_by=$3,decided_at=now() where id=$1 and status='pending' and staff_user_id<>$3 returning *`,[id.data,body.data.status,req.hrActor.id]);
  if(!result.rowCount)return res.status(409).json({error:'Leave not pending, not found, or self-approval forbidden.'});res.json({leave:result.rows[0]});
 }catch(e){next(e)}});
 return router;
}
