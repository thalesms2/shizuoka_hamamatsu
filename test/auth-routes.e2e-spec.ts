import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Role } from '../src/auth/role.enum.js';
import { AccessOperation } from '../src/access-histories/access-operation.enum.js';

describe('Auth routes (requires `docker compose up -d`)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let otherTenantId: string;

  const adminEmail = `routes-admin-${Date.now()}@probe.test`;
  const adminPassword = 'admin-secret';

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/auth/login').send(body);

  const signup = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/auth/signup')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const adminToken = async () => {
    const response = await login({ tenantId, email: adminEmail, password: adminPassword }).expect(200);
    return response.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.create({ data: { name: 'Routes Probe' } });
    const other = await prisma.tenant.create({ data: { name: 'Routes Probe Other' } });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const { PasswordService } = await import('../src/auth/password.service.js');
    await prisma.user.create({
      data: {
        tenantId,
        name: 'Admin',
        email: adminEmail,
        password: await new PasswordService().hash(adminPassword),
        role: Role.Admin,
      },
    });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await prisma.accessHistory.deleteMany({
      where: { tenantId: { in: [tenantId, otherTenantId] } },
    });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns a token for valid credentials', async () => {
      const response = await login({ tenantId, email: adminEmail, password: adminPassword }).expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it('rejects a wrong password', async () => {
      await login({ tenantId, email: adminEmail, password: 'wrong' }).expect(401);
    });

    it('rejects a valid user against another tenant', async () => {
      await login({ tenantId: otherTenantId, email: adminEmail, password: adminPassword }).expect(401);
    });

    it('rejects a malformed body', async () => {
      await login({ tenantId: 'not-a-uuid', email: 'nope', password: '' }).expect(400);
    });

    it('records a LOGIN access history for the user', async () => {
      const before = await prisma.accessHistory.count({ where: { tenantId } });

      await login({ tenantId, email: adminEmail, password: adminPassword }).expect(200);

      const histories = await prisma.accessHistory.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      });
      const admin = await prisma.user.findFirstOrThrow({
        where: { tenantId, email: adminEmail },
      });

      expect(histories.length).toBe(before + 1);
      expect(histories[0].operation).toBe(AccessOperation.Login);
      expect(histories[0].userId).toBe(admin.id);
      expect(histories[0].tenantId).toBe(tenantId);
    });

    it('records nothing when the login fails', async () => {
      const before = await prisma.accessHistory.count({ where: { tenantId } });

      await login({ tenantId, email: adminEmail, password: 'wrong' }).expect(401);

      expect(await prisma.accessHistory.count({ where: { tenantId } })).toBe(before);
    });

    it('never returns the password hash', async () => {
      const response = await login({ tenantId, email: adminEmail, password: adminPassword }).expect(200);

      expect(JSON.stringify(response.body)).not.toContain('scrypt:');
    });
  });

  describe('POST /auth/signup', () => {
    it('rejects an anonymous request', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ name: 'X', email: 'x@probe.test', password: 'secret', role: Role.Lawyer })
        .expect(401);
    });

    it('rejects a non-admin role', async () => {
      const token = await adminToken();
      const created = await signup(token, {
        name: 'Lawyer',
        email: `lawyer-${Date.now()}@probe.test`,
        password: 'secret',
        role: Role.Lawyer,
      }).expect(201);

      const lawyerLogin = await login({
        tenantId,
        email: created.body.email,
        password: 'secret',
      }).expect(200);

      await signup(lawyerLogin.body.accessToken, {
        name: 'Nope',
        email: `nope-${Date.now()}@probe.test`,
        password: 'secret',
        role: Role.Client,
      }).expect(403);
    });

    it('creates the user in the caller tenant and ignores a tenantId in the body', async () => {
      const token = await adminToken();
      const email = `scoped-${Date.now()}@probe.test`;

      const response = await signup(token, {
        name: 'Scoped',
        email,
        password: 'secret',
        role: Role.Client,
        tenantId: otherTenantId,
      }).expect(201);

      expect(response.body.tenantId).toBe(tenantId);
      expect(response.body).not.toHaveProperty('password');

      const created = await prisma.user.findFirstOrThrow({ where: { email } });
      expect(created.tenantId).toBe(tenantId);
    });

    it('rejects an email already used inside the tenant', async () => {
      const token = await adminToken();

      await signup(token, {
        name: 'Duplicate',
        email: adminEmail,
        password: 'secret',
        role: Role.Client,
      }).expect(409);
    });

    it('allows the same email in another tenant', async () => {
      const token = await adminToken();
      const email = `cross-${Date.now()}@probe.test`;

      await signup(token, { name: 'A', email, password: 'secret', role: Role.Client }).expect(201);
      await prisma.user.create({
        data: { tenantId: otherTenantId, name: 'B', email, password: 'x', role: Role.Client },
      });

      expect(await prisma.user.count({ where: { email } })).toBe(2);
    });

    it('rejects a malformed body', async () => {
      const token = await adminToken();

      await signup(token, { name: '', email: 'nope', password: '', role: 'KING' }).expect(400);
    });
  });
});
