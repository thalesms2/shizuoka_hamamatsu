import { NotFoundException } from '@nestjs/common';
import { MessageDirection } from './message-direction.enum.js';
import { MessagesService } from './messages.service.js';

describe('MessagesService', () => {
  const buildPrisma = () => ({
    phone: { findUnique: vi.fn(), findFirst: vi.fn() },
    client: { findFirst: vi.fn() },
    message: { create: vi.fn().mockResolvedValue({ id: 'm1' }) },
  });

  const zApi = { sendText: vi.fn().mockResolvedValue({ zaapId: 'z1', messageId: 'wa1' }) };

  const credentials = {
    tenantId: 't1',
    instanceId: 'INST',
    token: 'TOK',
    clientToken: 'CLIENT',
    number: '5511888888888',
  };

  beforeEach(() => {
    zApi.sendText.mockClear();
  });

  const build = (prisma: ReturnType<typeof buildPrisma>) =>
    new MessagesService(prisma as never, zApi as never);

  describe('send', () => {
    it('refuses to send when the tenant has no phone configured', async () => {
      const prisma = buildPrisma();
      prisma.phone.findUnique.mockResolvedValue(null);

      await expect(
        build(prisma).send('t1', { phone: '5511999999999', message: 'oi' }),
      ).rejects.toThrow(NotFoundException);
      expect(zApi.sendText).not.toHaveBeenCalled();
    });

    it('sends through the credentials of that tenant only', async () => {
      const prisma = buildPrisma();
      prisma.phone.findUnique.mockResolvedValue(credentials);
      prisma.client.findFirst.mockResolvedValue(null);

      await build(prisma).send('t1', { phone: '5511999999999', message: 'oi' });

      expect(prisma.phone.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 't1' },
      });
      expect(zApi.sendText).toHaveBeenCalledWith(
        { instanceId: 'INST', token: 'TOK', clientToken: 'CLIENT' },
        '5511999999999',
        'oi',
      );
    });

    it('stores the outbound message with the id returned by Z-API', async () => {
      const prisma = buildPrisma();
      prisma.phone.findUnique.mockResolvedValue(credentials);
      prisma.client.findFirst.mockResolvedValue({ id: 'c1' });

      await build(prisma).send('t1', { phone: '5511999999999', message: 'oi' });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't1',
          clientId: 'c1',
          direction: MessageDirection.Outbound,
          phone: '5511999999999',
          text: 'oi',
          externalId: 'wa1',
        },
      });
    });

    it('stores nothing when Z-API refuses the message', async () => {
      const prisma = buildPrisma();
      prisma.phone.findUnique.mockResolvedValue(credentials);
      prisma.client.findFirst.mockResolvedValue(null);
      zApi.sendText.mockRejectedValueOnce(new Error('refused'));

      await expect(
        build(prisma).send('t1', { phone: '5511999999999', message: 'oi' }),
      ).rejects.toThrow();
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('receive', () => {
    const payload = {
      instanceId: 'INST',
      messageId: 'wa-in-1',
      phone: '5511999999999',
      fromMe: false,
      type: 'ReceivedCallback',
      text: { message: 'ola' },
    };

    it('rejects a payload whose instance belongs to nobody', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(null);

      await expect(build(prisma).receive('INST', 'TOK', payload)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a payload whose token does not match the instance', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(null);

      await expect(build(prisma).receive('INST', 'WRONG', payload)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.phone.findFirst).toHaveBeenCalledWith({
        where: { instanceId: 'INST', token: 'WRONG', deleted: false },
      });
    });

    it('stores the inbound message in the tenant that owns the instance', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(credentials);
      prisma.client.findFirst.mockResolvedValue({ id: 'c1' });

      await build(prisma).receive('INST', 'TOK', payload);

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: {
          tenantId: 't1',
          clientId: 'c1',
          direction: MessageDirection.Inbound,
          phone: '5511999999999',
          text: 'ola',
          externalId: 'wa-in-1',
        },
      });
    });

    it('stores an inbound message from an unknown number with no client', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(credentials);
      prisma.client.findFirst.mockResolvedValue(null);

      await build(prisma).receive('INST', 'TOK', payload);

      expect(prisma.message.create.mock.calls[0][0].data.clientId).toBeNull();
    });

    it('ignores a callback that carries no text', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(credentials);

      await build(prisma).receive('INST', 'TOK', { ...payload, text: undefined });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('ignores a callback for a message sent by the instance itself', async () => {
      const prisma = buildPrisma();
      prisma.phone.findFirst.mockResolvedValue(credentials);

      await build(prisma).receive('INST', 'TOK', { ...payload, fromMe: true });

      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });
});
