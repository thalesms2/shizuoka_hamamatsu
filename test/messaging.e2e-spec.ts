import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Role } from '../src/auth/role.enum.js';
import { MessageDirection } from '../src/messaging/message-direction.enum.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Messaging (requires `docker compose up -d`)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let otherTenantId: string;
  let clientId: string;
  let adminToken: string;

  const password = 'messaging-secret';
  const email = `messaging-${Date.now()}@probe.test`;
  const clientPhone = '5511999990000';
  const fetchMock = vi.fn();

  const webhookUrl = (instanceId: string, token: string) =>
    `/webhooks/z-api/${instanceId}/${token}/received`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const tenant = await prisma.tenant.create({ data: { name: 'Messaging Probe' } });
    const other = await prisma.tenant.create({ data: { name: 'Messaging Other' } });
    tenantId = tenant.id;
    otherTenantId = other.id;

    await prisma.phone.create({
      data: {
        tenantId,
        number: '5511888880000',
        instanceId: 'INSTANCE-A',
        token: 'TOKEN-A',
        clientToken: 'CLIENT-A',
      },
    });

    const client = await prisma.client.create({
      data: { tenantId, name: 'Client A', phone: clientPhone },
    });
    clientId = client.id;

    await prisma.user.create({
      data: {
        tenantId,
        name: 'Admin',
        email,
        password: await new PasswordService().hash(password),
        role: Role.Admin,
      },
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId, email, password })
      .expect(200);
    adminToken = login.body.accessToken;
  });

  afterAll(async () => {
    const tenants = [tenantId, otherTenantId];
    await prisma.message.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.phone.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.client.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.refreshToken.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.accessHistory.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await app.close();
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const zApiAccepts = () =>
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ zaapId: 'z1', messageId: 'wa-out-1', id: 'wa-out-1' }),
      text: () => Promise.resolve('{}'),
    });

  describe('POST /messages', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .post('/messages')
        .send({ phone: clientPhone, message: 'oi' })
        .expect(401);
    });

    it('sends through the tenant credentials and stores the message', async () => {
      zApiAccepts();

      const response = await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: clientPhone, message: 'ola cliente' })
        .expect(201);

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.z-api.io/instances/INSTANCE-A/token/TOKEN-A/send-text',
      );
      expect(fetchMock.mock.calls[0][1].headers['Client-Token']).toBe('CLIENT-A');
      expect(response.body.direction).toBe(MessageDirection.Outbound);
      expect(response.body.tenantId).toBe(tenantId);
      expect(response.body.clientId).toBe(clientId);
      expect(response.body.externalId).toBe('wa-out-1');
    });

    it('rejects a malformed phone', async () => {
      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: '(11) 99999-0000', message: 'oi' })
        .expect(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('answers 503 when Z-API refuses, and stores nothing', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error":"null clientToken"}'),
      });
      const before = await prisma.message.count({ where: { tenantId } });

      await request(app.getHttpServer())
        .post('/messages')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ phone: clientPhone, message: 'falha' })
        .expect(503);

      expect(await prisma.message.count({ where: { tenantId } })).toBe(before);
    });
  });

  describe('POST /webhooks/z-api/:instanceId/:token/received', () => {
    const payload = (overrides: Record<string, unknown> = {}) => ({
      instanceId: 'INSTANCE-A',
      messageId: `wa-in-${Date.now()}`,
      phone: clientPhone,
      fromMe: false,
      type: 'ReceivedCallback',
      text: { message: 'ola escritorio' },
      ...overrides,
    });

    it('stores an inbound message against the tenant that owns the instance', async () => {
      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'TOKEN-A'))
        .send(payload())
        .expect(200);

      const stored = await prisma.message.findFirst({
        where: { tenantId, direction: MessageDirection.Inbound },
        orderBy: { createdAt: 'desc' },
      });

      expect(stored?.text).toBe('ola escritorio');
      expect(stored?.clientId).toBe(clientId);
    });

    it('needs no authentication', async () => {
      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'TOKEN-A'))
        .send(payload())
        .expect(200);
    });

    it('rejects a wrong token for a known instance', async () => {
      const before = await prisma.message.count({ where: { tenantId } });

      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'WRONG-TOKEN'))
        .send(payload())
        .expect(404);

      expect(await prisma.message.count({ where: { tenantId } })).toBe(before);
    });

    it('rejects an unknown instance', async () => {
      await request(app.getHttpServer())
        .post(webhookUrl('GHOST', 'TOKEN-A'))
        .send(payload())
        .expect(404);
    });

    it('stores a message from an unknown number with no client attached', async () => {
      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'TOKEN-A'))
        .send(payload({ phone: '5511777770000' }))
        .expect(200);

      const stored = await prisma.message.findFirst({
        where: { tenantId, phone: '5511777770000' },
      });

      expect(stored).not.toBeNull();
      expect(stored?.clientId).toBeNull();
    });

    it('ignores a callback with no text', async () => {
      const before = await prisma.message.count({ where: { tenantId } });

      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'TOKEN-A'))
        .send(payload({ text: undefined }))
        .expect(200);

      expect(await prisma.message.count({ where: { tenantId } })).toBe(before);
    });

    it('never attaches a message to another tenant', async () => {
      await request(app.getHttpServer())
        .post(webhookUrl('INSTANCE-A', 'TOKEN-A'))
        .send(payload())
        .expect(200);

      expect(await prisma.message.count({ where: { tenantId: otherTenantId } })).toBe(0);
    });
  });
});
