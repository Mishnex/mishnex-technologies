import { z } from 'zod';

// Module 2: shared, side-effect-free lead workflow validation.
// Database and HTTP mutations remain disabled until migration and Owner review.
export const leadStatuses = Object.freeze(['new','contacted','qualified','proposal','won','lost']);
export const leadStatusSchema = z.enum(leadStatuses);
export const leadUpdateSchema = z.object({
  status: leadStatusSchema,
  note: z.string().trim().min(1).max(2000).optional()
}).strict();

export function canTransitionLead(from, to) {
  if (!leadStatusSchema.safeParse(from).success || !leadStatusSchema.safeParse(to).success) return false;
  if (from === to) return true;
  const transitions = {
    new: ['contacted','qualified','lost'],
    contacted: ['qualified','lost'],
    qualified: ['proposal','lost'],
    proposal: ['won','lost'],
    won: [],
    lost: []
  };
  return transitions[from].includes(to);
}
