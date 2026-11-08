import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessOperation } from './access-operation.enum.js';

@Injectable()
export class AccessHistoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tenantId: string,
    userId: string,
    operation: AccessOperation,
  ): Promise<void> {
    await this.prisma.accessHistory.create({
      data: { tenantId, userId, operation },
    });
  }
}
