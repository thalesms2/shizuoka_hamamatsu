import { createTenantClient } from './tenant-client.js';

describe('createTenantClient', () => {
  const buildBase = () => {
    const calls: { model?: string; operation: string; args: never }[] = [];
    const base = {
      $extends: ({ query }: never) => ({ query, calls }),
      calls,
    };

    return base as never as {
      $extends: (config: never) => {
        query: {
          $allModels: {
            $allOperations: (ctx: never) => unknown;
          };
        };
      };
    };
  };

  const run = (model: string, operation: string, args: Record<string, unknown>) => {
    const extended = createTenantClient(buildBase() as never, 'tenant-1') as never as {
      query: {
        $allModels: {
          $allOperations: (ctx: {
            model: string;
            operation: string;
            args: Record<string, unknown>;
            query: (args: Record<string, unknown>) => unknown;
          }) => unknown;
        };
      };
    };
    let received: Record<string, unknown> | undefined;

    const result = extended.query.$allModels.$allOperations({
      model,
      operation,
      args,
      query: (finalArgs) => {
        received = finalArgs;
        return { tenantId: 'tenant-1' };
      },
    });

    return { received, result };
  };

  it('adds the tenant to a findMany filter', () => {
    const { received } = run('User', 'findMany', { where: { email: 'a@a.com' } });

    expect(received?.where).toEqual({ email: 'a@a.com', tenantId: 'tenant-1' });
  });

  it('adds the tenant when there is no filter at all', () => {
    const { received } = run('Invoice', 'findMany', {});

    expect(received?.where).toEqual({ tenantId: 'tenant-1' });
  });

  it('overrides a tenant the caller tried to force', () => {
    const { received } = run('Invoice', 'findMany', {
      where: { tenantId: 'another-tenant' },
    });

    expect(received?.where).toEqual({ tenantId: 'tenant-1' });
  });

  it('adds the tenant to created data', () => {
    const { received } = run('Client', 'create', { data: { name: 'A' } });

    expect(received?.data).toEqual({ name: 'A', tenantId: 'tenant-1' });
  });

  it('overrides a tenant forced in created data', () => {
    const { received } = run('Client', 'create', {
      data: { name: 'A', tenantId: 'another-tenant' },
    });

    expect(received?.data).toEqual({ name: 'A', tenantId: 'tenant-1' });
  });

  it('adds the tenant to every row of a createMany', () => {
    const { received } = run('Client', 'createMany', {
      data: [{ name: 'A' }, { name: 'B', tenantId: 'another-tenant' }],
    });

    expect(received?.data).toEqual([
      { name: 'A', tenantId: 'tenant-1' },
      { name: 'B', tenantId: 'tenant-1' },
    ]);
  });

  it('scopes both halves of an upsert', () => {
    const { received } = run('Client', 'upsert', {
      where: { id: 'c1' },
      create: { name: 'A' },
      update: { name: 'B' },
    });

    expect(received?.where).toEqual({ id: 'c1', tenantId: 'tenant-1' });
    expect(received?.create).toEqual({ name: 'A', tenantId: 'tenant-1' });
  });

  it('scopes update and delete filters', () => {
    expect(run('Invoice', 'update', { where: { id: 'i1' }, data: {} }).received?.where).toEqual({
      id: 'i1',
      tenantId: 'tenant-1',
    });
    expect(run('Invoice', 'delete', { where: { id: 'i1' } }).received?.where).toEqual({
      id: 'i1',
      tenantId: 'tenant-1',
    });
  });

  it('leaves the tenants model alone, since it has no tenant column', () => {
    const { received } = run('Tenant', 'findMany', { where: { name: 'X' } });

    expect(received?.where).toEqual({ name: 'X' });
  });
});
