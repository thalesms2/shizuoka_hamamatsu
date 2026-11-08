import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessageDirection } from './message-direction.enum.js';
import type { ReceivedCallback, SendMessageDto } from './message.dto.js';
import { ZApiClient } from './z-api.client.js';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zApi: ZApiClient,
  ) {}

  async send(tenantId: string, dto: SendMessageDto) {
    const phone = await this.prisma.phone.findUnique({ where: { tenantId } });

    if (!phone || phone.deleted) {
      throw new NotFoundException('This tenant has no WhatsApp phone configured');
    }

    const sent = await this.zApi.sendText(
      {
        instanceId: phone.instanceId,
        token: phone.token,
        clientToken: phone.clientToken,
      },
      dto.phone,
      dto.message,
    );

    const client = await this.findClient(tenantId, dto.phone);

    this.logger.log(
      `Message ${sent.messageId} sent to ${dto.phone} in tenant ${tenantId}`,
    );

    return this.prisma.message.create({
      data: {
        tenantId,
        clientId: client?.id ?? null,
        direction: MessageDirection.Outbound,
        phone: dto.phone,
        text: dto.message,
        externalId: sent.messageId,
      },
    });
  }

  async receive(
    instanceId: string,
    token: string,
    payload: ReceivedCallback,
  ): Promise<void> {
    const phone = await this.prisma.phone.findFirst({
      where: { instanceId, token, deleted: false },
    });

    if (!phone) {
      this.logger.warn(
        `Webhook rejected: no tenant owns instance ${instanceId} with the presented token`,
      );

      throw new NotFoundException('Unknown instance');
    }

    const text = payload.text?.message;

    if (!text || payload.fromMe || !payload.phone) {
      this.logger.log(
        `Webhook for instance ${instanceId} ignored: nothing to store`,
      );

      return;
    }

    const client = await this.findClient(phone.tenantId, payload.phone);

    await this.prisma.message.create({
      data: {
        tenantId: phone.tenantId,
        clientId: client?.id ?? null,
        direction: MessageDirection.Inbound,
        phone: payload.phone,
        text,
        externalId: payload.messageId ?? null,
      },
    });

    this.logger.log(
      `Message received from ${payload.phone} in tenant ${phone.tenantId}`,
    );
  }

  private findClient(tenantId: string, phone: string) {
    return this.prisma.client.findFirst({
      where: { tenantId, phone, deleted: false },
    });
  }
}
