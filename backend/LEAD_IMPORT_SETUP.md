# Lead collection and spreadsheet import

Branch: feature/smart-lead-import-20261014. Do not treat this branch as a live deployment.

## Staff workflow

Owner or Owner-created authorized Super Admin opens Manual lead entry → Bulk Excel / CSV upload. Upload .xlsx (5 MB maximum) or .csv, select a visible worksheet, confirm column mappings, preview name/phone/email/location, then confirm import. Row 1 must contain unique column names. Name, phone and location are required; email is optional. Format phones as text in Excel to preserve leading zeros. Formulas must be replaced with values. Maximum 2,000 leads per batch; upload further batches as needed.

Invalid rows and duplicate phone numbers inside the file prevent import. Contacts already in CRM are skipped. Import is transactional and retries do not create new contacts for existing phone numbers. Excel leads carry source `excel` and the importing actor ID. Manual entry remains available.

Generate Lead randomly selects an eligible unassigned new contact from manual, Excel, website, Facebook, Instagram or connected-source records. Each staff member has one open assignment. Close the contact with outcome and remarks before generating another. Row locking and the existing assignment constraints prevent two staff members claiming the same lead.

## Deployment

Apply `supabase/migrations/20261014105229_connected_lead_ingestion.sql` before deploying this branch's backend. Install dependencies with `npm ci`. Run `npm test`. Existing production has not been changed by this delivery.

## Meta Facebook / Instagram lead forms

Configure server environment variables META_APP_SECRET, META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, META_PAGE_IDS (comma-separated owned Page IDs), META_GRAPH_API_VERSION (a currently supported version from the Meta app dashboard). Do not put secrets in repository files or the browser.

Callback: https://admin.mishnextechnologies.com/api/integrations/leads/meta

Subscribe the authorized Page's `leadgen` event and give the app/token the permissions Meta requires to retrieve its lead forms. Instagram lead ads are retrieved through the associated Page. This does not collect arbitrary profiles or messages.

Ensure each form supplies `full_name` (or first_name + last_name), `phone_number`, optionally `email` and `city` / `location`. Unsupported custom field names must be adapted before activation. Invalid leads return 422 without saving; retrieval failures return 502 for provider retries. Only allowlisted Pages are processed. Verify using Meta's Lead Ads Testing Tool and a real form submission before declaring connected.

GET verification uses the verify token. POST deliveries verify HMAC-SHA256 on exact raw bytes. Retrieved provider IDs are stored privately for idempotency, including when the phone matches an existing contact. A delivery is acknowledged only after processing completes. No background job or always-running scheduler is required.

## Other authorized sources

Set LEAD_SOURCE_SECRETS as JSON mapping each source slug to its own random secret, at least 32 characters. A source's server sends POST /api/integrations/leads/connected/{slug}, Content-Type application/json, X-Lead-Signature `sha256=` plus hex HMAC-SHA256 of exact UTF-8 request bytes using that source's secret.

Example payload:

```json
{"eventId":"provider-event-123","lead":{"name":"Client Name","phone":"9876543210","email":"","location":"Kolkata","service":"Website development","requirement":"Please contact me"}}
```

Send a stable eventId on retries. Response includes received, leadId, duplicate. These contacts have source integration. No secret is returned by the management connection-status endpoint. Connections must be configured by the Owner in the server environment.

## Verification and limits

Automated tests cover XLSX parsing, phone text preservation, mapping ambiguity, role denial, preview without writes, transaction commits, >16 KB batches, signatures, source allowlists and provider retries. Database checks must run against staging first. Meta end-to-end delivery remains dependent on a real authorized Page/token/subscription; tests use a simulated provider. The status panel reports credential configuration, not verified live delivery.
