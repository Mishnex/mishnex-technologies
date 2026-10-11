# Staff account implementation status

Owner-only account provisioning, unique individual credentials, first-login password change, password reset, deactivation/revocation, immutable role permissions and the five active Super Admin account/session caps are implemented. Supabase service-role credentials are used only on the server. Owner gets newly generated temporary credentials once; plaintext passwords are not persisted by the CRM.

Owner-delegated Super Admins can approve/review payments and control advance terms. Sales, HR and Accountant cannot approve payments; only Owner manages accounts and grants. Shared workspace authentication checks active staff, password-change requirement, session cutoff and registered Super Admin session on each protected request.

Enabled `/staff-login` routes to the shared staff workspace. The current feature branch is not deployed live. See [ERP_CRM_DELIVERY.md](ERP_CRM_DELIVERY.md) for complete test evidence, staging deployment, real-account acceptance and Owner-approved production gates.
