import { z } from 'zod';

// Module 2: client conversion rules; no writes or live activation.
export const clientSchema=z.object({
  name:z.string().trim().min(1).max(200),
  email:z.string().trim().email().max(254),
  phone:z.string().trim().max(40).optional().nullable()
}).strict();

export function canConvertLead(status) {
  return status==='won';
}

export function clientFromLead(lead) {
  if(!canConvertLead(lead?.status))throw new Error('Only won leads can become clients');
  const parsed=clientSchema.safeParse({
    name:lead.name,
    email:lead.email,
    phone:lead.phone ?? null
  });
  if(!parsed.success)throw new Error('Lead contact details must be corrected before conversion');
  return parsed.data;
}
