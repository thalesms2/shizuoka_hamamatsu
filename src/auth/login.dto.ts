import { z } from 'zod';

export const loginSchema = z.object({
  tenantId: z.uuid(),
  email: z.email().max(255).toLowerCase(),
  password: z.string().min(1).max(255),
});

export type LoginDto = z.infer<typeof loginSchema>;
