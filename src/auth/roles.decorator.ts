import { SetMetadata } from '@nestjs/common';
import type { Role } from './role.enum.js';

export const ROLES_KEY = 'auth:roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
