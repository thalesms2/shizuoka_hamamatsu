import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 7;

export interface ConsumedRefreshToken {
  tenantId: string;
  userId: string;
  refreshToken: string;
}

@Injectable()
export class RefreshTokensService {
  private readonly logger = new Logger(RefreshTokensService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issue(
    tenantId: string,
    userId: string,
    replaces?: string,
  ): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('hex');

    const created = await this.prisma.refreshToken.create({
      data: {
        tenantId,
        userId,
        tokenHash: this.hash(token),
        expiresAt: this.expiry(),
      },
    });

    if (replaces) {
      await this.prisma.refreshToken.update({
        where: { id: replaces },
        data: {
          revoked: true,
          revokedAt: new Date(),
          replacedById: created.id,
        },
      });
    }

    return token;
  }

  async consume(token: string): Promise<ConsumedRefreshToken> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
    });

    if (!stored) {
      this.logger.warn('Refresh rejected: token is not known');

      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revoked) {
      await this.revokeAllFor(stored.userId);
      this.logger.warn(
        `Refresh rejected: token for user ${stored.userId} was already used; every active token of this user was revoked`,
      );

      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      this.logger.warn(
        `Refresh rejected: token for user ${stored.userId} expired`,
      );

      throw new UnauthorizedException('Invalid refresh token');
    }

    const refreshToken = await this.issue(
      stored.tenantId,
      stored.userId,
      stored.id,
    );

    this.logger.log(
      `Refresh token rotated for user ${stored.userId} in tenant ${stored.tenantId}`,
    );

    return {
      tenantId: stored.tenantId,
      userId: stored.userId,
      refreshToken,
    };
  }

  async revokeByValue(userId: string, token: string): Promise<void> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { tokenHash: this.hash(token), userId },
    });

    this.logger.log(
      count > 0
        ? `Refresh token deleted on logout for user ${userId}`
        : `Logout for user ${userId} presented a token that is not theirs or no longer exists`,
    );
  }

  async revokeAllFor(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private expiry(): Date {
    const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? DEFAULT_TTL_DAYS);

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
