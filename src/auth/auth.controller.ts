import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { createUserSchema, type CreateUserDto } from '../users/user.dto.js';
import type { PublicUser } from '../users/user.dto.js';
import { UsersService } from '../users/users.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { AuthService, type LoginResult } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { loginSchema, type LoginDto } from './login.dto.js';
import { refreshSchema, type RefreshDto } from './refresh.dto.js';
import { Public } from './public.decorator.js';
import { Role } from './role.enum.js';
import { Roles } from './roles.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body({ schema: loginSchema }) dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Body({ schema: refreshSchema }) dto: RefreshDto,
  ): Promise<LoginResult> {
    return this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: refreshSchema }) dto: RefreshDto,
  ): Promise<void> {
    return this.authService.logout(user.userId, dto);
  }

  @Roles(Role.Admin)
  @Post('signup')
  signup(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createUserSchema }) dto: CreateUserDto,
  ): Promise<PublicUser> {
    return this.usersService.create(user.tenantId, dto);
  }
}
