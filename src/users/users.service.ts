import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto, PublicUser } from './user.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  findActiveByEmail(tenantId: string, email: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, email, deleted: false },
    });
  }

  findActiveById(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, deleted: false },
    });
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<PublicUser> {
    const existing = await this.findActiveByEmail(tenantId, dto.email);

    if (existing) {
      this.logger.warn(
        `User creation rejected: ${dto.email} already exists in tenant ${tenantId}`,
      );

      throw new ConflictException('Email already used in this tenant');
    }

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        password: await this.passwordService.hash(dto.password),
        role: dto.role,
      },
    });

    this.logger.log(
      `User ${user.id} created with role ${user.role} in tenant ${tenantId}`,
    );

    return {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
