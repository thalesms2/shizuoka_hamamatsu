import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessHistoriesService } from '../access-histories/access-histories.service.js';
import { AccessOperation } from '../access-histories/access-operation.enum.js';
import { UsersService } from '../users/users.service.js';
import type { Role } from './role.enum.js';
import type { LoginDto } from './login.dto.js';
import type { RefreshDto } from './refresh.dto.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { PasswordService } from './password.service.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly accessHistories: AccessHistoriesService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.usersService.findActiveByEmail(
      dto.tenantId,
      dto.email,
    );

    const matches =
      user !== null &&
      (await this.passwordService.verify(dto.password, user.password));

    if (!user || !matches) {
      this.logger.warn(
        `Login failed for ${dto.email} in tenant ${dto.tenantId}: ${user ? 'wrong password' : 'unknown user'}`,
      );

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.accessHistories.record(
      user.tenantId,
      user.id,
      AccessOperation.Login,
    );

    this.logger.log(
      `Login succeeded for user ${user.id} (role ${user.role}) in tenant ${user.tenantId}`,
    );

    return {
      accessToken: await this.signAccessToken(
        user.id,
        user.tenantId,
        user.role as Role,
      ),
      refreshToken: await this.refreshTokens.issue(user.tenantId, user.id),
    };
  }

  async refresh(dto: RefreshDto): Promise<LoginResult> {
    const consumed = await this.refreshTokens.consume(dto.refreshToken);
    const user = await this.usersService.findActiveById(consumed.userId);

    if (!user) {
      await this.refreshTokens.revokeAllFor(consumed.userId);
      this.logger.warn(
        `Refresh rejected: user ${consumed.userId} is deleted or gone`,
      );

      throw new UnauthorizedException('Invalid refresh token');
    }

    return {
      accessToken: await this.signAccessToken(
        user.id,
        user.tenantId,
        user.role as Role,
      ),
      refreshToken: consumed.refreshToken,
    };
  }

  async logout(userId: string, dto: RefreshDto): Promise<void> {
    await this.refreshTokens.revokeByValue(userId, dto.refreshToken);
  }

  private signAccessToken(
    userId: string,
    tenantId: string,
    role: Role,
  ): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, tenantId, role });
  }
}
