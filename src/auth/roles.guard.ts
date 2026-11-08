import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from './authenticated-user.js';
import type { Role } from './role.enum.js';
import { ROLES_KEY } from './roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      method: string;
      url: string;
    }>();
    const { user } = request;

    if (!user || !required.includes(user.role)) {
      this.logger.warn(
        `Rejected ${request.method} ${request.url}: role ${user?.role ?? 'anonymous'} is not in [${required.join(', ')}]`,
      );

      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
