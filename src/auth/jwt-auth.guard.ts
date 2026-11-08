import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedUser, JwtPayload } from './authenticated-user.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      this.reject(request, 'missing bearer token');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      return this.reject(request, 'invalid token signature or expiry');
    }

    if (!payload.sub || !payload.tenantId || !payload.role) {
      this.reject(request, 'token is missing required claims');
    }

    const user: AuthenticatedUser = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };

    Object.assign(request, { user });

    return true;
  }

  private reject(request: Request, reason: string): never {
    this.logger.warn(
      `Rejected ${request.method} ${request.url}: ${reason}`,
    );

    throw new UnauthorizedException('Unauthorized');
  }

  private extractToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    return scheme === 'Bearer' ? token : undefined;
  }
}
