import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Role } from '../src/auth/role.enum.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Refresh token (requires `docker compose up -d`)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;

  const email = `refresh-${Date.now()}@probe.test`;
  const password = 'refresh-secret';

  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ tenantId, email, password })
      .expect(200);

  const refresh = (refreshToken: string) =>
    request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.create({ data: { name: 'Refresh Probe' } });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        name: 'Refresh User',
        email,
        password: await new PasswordService().hash(password),
        role: Role.Lawyer,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { tenantId } });
    await prisma.accessHistory.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await app.close();
  });

  it('returns a refresh token on login and stores only its hash', async () => {
    const response = await login();
    const { refreshToken } = response.body;

    expect(refreshToken).toEqual(expect.any(String));

    const stored = await prisma.refreshToken.findMany({ where: { userId } });
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.some((row) => row.tokenHash === refreshToken)).toBe(false);
  });

  it('exchanges a refresh token for a new pair', async () => {
    const { body } = await login();

    const refreshed = await refresh(body.refreshToken).expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(body.refreshToken);
  });

  it('revokes the old token on rotation', async () => {
    const { body } = await login();

    await refresh(body.refreshToken).expect(200);
    await refresh(body.refreshToken).expect(401);
  });

  it('revokes every active token of the user when a used token is replayed', async () => {
    const first = await login();
    const second = await login();

    await refresh(first.body.refreshToken).expect(200);
    await refresh(first.body.refreshToken).expect(401);

    await refresh(second.body.refreshToken).expect(401);
    expect(
      await prisma.refreshToken.count({ where: { userId, revoked: false } }),
    ).toBe(0);
  });

  it('rejects an unknown token', async () => {
    await refresh('a'.repeat(64)).expect(401);
  });

  it('rejects an expired token', async () => {
    const { body } = await login();
    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await refresh(body.refreshToken).expect(401);
  });

  it('rejects a refresh for a soft-deleted user', async () => {
    const { body } = await login();
    await prisma.user.update({ where: { id: userId }, data: { deleted: true } });

    await refresh(body.refreshToken).expect(401);

    await prisma.user.update({ where: { id: userId }, data: { deleted: false } });
  });

  it('rejects a malformed body', async () => {
    await refresh('').expect(400);
  });

  describe('POST /auth/logout', () => {
    beforeEach(async () => {
      await prisma.refreshToken.deleteMany({ where: { tenantId } });
    });

    const logout = (accessToken: string, refreshToken: string) =>
      request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

    it('deletes the token row so it cannot be replayed', async () => {
      const { body } = await login();

      await logout(body.accessToken, body.refreshToken).expect(204);

      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
      await refresh(body.refreshToken).expect(401);
    });

    it('rejects an anonymous logout', async () => {
      const { body } = await login();

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: body.refreshToken })
        .expect(401);

      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
      await prisma.refreshToken.deleteMany({ where: { userId } });
    });

    it('does not delete a token that belongs to another user', async () => {
      const other = await prisma.user.create({
        data: {
          tenantId,
          name: 'Other',
          email: `other-${Date.now()}@probe.test`,
          password: await new PasswordService().hash(password),
          role: Role.Lawyer,
        },
      });
      const victim = await login();
      const attacker = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ tenantId, email: other.email, password })
        .expect(200);

      await logout(attacker.body.accessToken, victim.body.refreshToken).expect(204);

      expect(await prisma.refreshToken.count({ where: { userId } })).toBe(1);
      await refresh(victim.body.refreshToken).expect(200);

      await prisma.refreshToken.deleteMany({ where: { tenantId } });
      await prisma.accessHistory.deleteMany({ where: { userId: other.id } });
      await prisma.user.delete({ where: { id: other.id } });
    });

    it('stays idempotent for a token that is already gone', async () => {
      const { body } = await login();

      await logout(body.accessToken, body.refreshToken).expect(204);
      await logout(body.accessToken, body.refreshToken).expect(204);
    });
  });
});
