CREATE TABLE IF NOT EXISTS public.crm_hr_employee_profiles (
  staff_user_id uuid PRIMARY KEY REFERENCES public.crm_staff(user_id) ON DELETE CASCADE,
  department text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  joining_date date,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_hr_attendance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_user_id uuid NOT NULL REFERENCES public.crm_staff(user_id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('present','absent','half_day','on_leave')),
  notes text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_user_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS public.crm_hr_leave_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_user_id uuid NOT NULL REFERENCES public.crm_staff(user_id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
ALTER TABLE public.crm_hr_employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_hr_leave_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_hr_employee_profiles,public.crm_hr_attendance,public.crm_hr_leave_requests FROM anon,authenticated;
REVOKE ALL ON SEQUENCE public.crm_hr_attendance_id_seq,public.crm_hr_leave_requests_id_seq FROM anon,authenticated;