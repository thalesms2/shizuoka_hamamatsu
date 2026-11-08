import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AccessHistoriesModule } from '../access-histories/access-histories.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordService } from './password.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { RolesGuard } from './roles.guard.js';

const secret = process.env.JWT_SECRET;

if (!secret) {
  throw new Error('JWT_SECRET is not set');
}

const expiresIn = (process.env.JWT_EXPIRES_IN ??
  '15m') as JwtSignOptions['expiresIn'];

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret,
      signOptions: { expiresIn },
    }),
    UsersModule,
    AccessHistoriesModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    RefreshTokensService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PasswordService],
})
export class AuthModule {}
