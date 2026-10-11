export const releaseTables = [
  'crm_leads','crm_staff','crm_staff_audit','crm_super_admin_sessions','crm_lead_activity',
  'crm_clients','crm_hr_employee_profiles','crm_hr_attendance','crm_hr_leave_requests',
  'crm_projects','crm_project_tasks','crm_quotations','crm_invoices','crm_website_content',
  'crm_client_portal_access','crm_invoice_payments','crm_payment_review_grants',
  'crm_payment_submissions','crm_payment_audit','crm_business_policy','crm_payment_control_audit',
  'crm_client_login_accounts','crm_staff_call_activity','crm_staff_work_activity','crm_invoice_detail_audit'
].map(name => 'public.' + name);

export function readinessHandler(pool, isStopping = () => false) {
  return async (_req, res) => {
    res.set('Cache-Control','no-store');
    if (isStopping()) return res.status(503).json({status:'unavailable'});
    try {
      const result = await pool.query({
        text: `select bool_and(to_regclass(name) is not null) as schema_ready
          from unnest($1::text[]) as name`, values:[releaseTables], query_timeout:5000
      });
      if (!result.rows[0]?.schema_ready || isStopping()) return res.status(503).json({status:'unavailable'});
      res.json({status:'ready'});
    } catch {
      res.status(503).json({status:'unavailable'});
    }
  };
}
