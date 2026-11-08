import { z } from 'zod';
import { Role } from '../auth/role.enum.js';

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.email().max(255).toLowerCase(),
  password: z.string().min(1).max(255),
  role: z.enum([Role.Admin, Role.Lawyer, Role.Client]),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;

export interface PublicUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
}
