import type { Role } from './role.enum.js';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: Role;
}
