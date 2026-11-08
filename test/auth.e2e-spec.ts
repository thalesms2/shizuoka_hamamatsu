import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { CurrentUser } from '../src/auth/current-user.decorator.js';
import { Public } from '../src/auth/public.decorator.js';
import { Role } from '../src/auth/role.enum.js';
import { Roles } from '../src/auth/roles.decorator.js';
import type { AuthenticatedUser } from '../src/auth/authenticated-user.js';

@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open(): string {
    return 'open';
  }

  @Get('protected')
  protected(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Roles(Role.Admin)
  @Get('admin-only')
  adminOnly(): string {
    return 'admin';
  }
}

describe('Global authentication (requires `docker compose up -d`)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const tokenFor = (role: string) =>
    jwtService.signAsync({ sub: 'user-1', tenantId: 'tenant-1', role });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    jwtService = app.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps a @Public route reachable with no token', async () => {
    await request(app.getHttpServer()).get('/probe/open').expect(200);
  });

  it('rejects a protected route with no token', async () => {
    await request(app.getHttpServer()).get('/probe/protected').expect(401);
  });

  it('rejects a token signed with another secret', async () => {
    const foreign = new JwtService({ secret: 'another-secret' });
    const token = await foreign.signAsync({
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: Role.Admin,
    });

    await request(app.getHttpServer())
      .get('/probe/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('exposes userId, tenantId and role to the handler', async () => {
    const token = await tokenFor(Role.Admin);

    const response = await request(app.getHttpServer())
      .get('/probe/protected')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: Role.Admin,
    });
  });

  it('rejects a role that the route does not allow', async () => {
    const token = await tokenFor(Role.Client);

    await request(app.getHttpServer())
      .get('/probe/admin-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a role that the route lists', async () => {
    const token = await tokenFor(Role.Admin);

    await request(app.getHttpServer())
      .get('/probe/admin-only')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
