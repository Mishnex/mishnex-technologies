import { z } from 'zod';

export const leadSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
  service: z.string().trim().min(2).max(120),
  budget: z.string().trim().max(120).optional().default(''),
  calltime: z.string().trim().max(120).optional().default(''),
  requirement: z.string().trim().min(10).max(5000),
  // Invisible anti-spam field. Legitimate browsers leave it blank.
  website: z.string().max(200).optional().default('')
}).strict();
