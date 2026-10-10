CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(254) NOT NULL,
  phone varchar(20) NOT NULL,
  service varchar(120) NOT NULL,
  budget varchar(120),
  preferred_call_time varchar(120),
  requirement text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed')),
  source varchar(32) NOT NULL DEFAULT 'website',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_leads_created_at_idx ON crm_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_status_idx ON crm_leads (status);
