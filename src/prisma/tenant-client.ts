import type { PrismaService } from './prisma.service.js';

const MODELS_WITHOUT_TENANT = new Set(['Tenant']);

const FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
]);

type Args = Record<string, unknown>;

const withTenant = (value: unknown, tenantId: string): Args => ({
  ...(value as Args),
  tenantId,
});

export const createTenantClient = (prisma: PrismaService, tenantId: string) =>
  prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (model && MODELS_WITHOUT_TENANT.has(model)) {
            return query(args);
          }

          const scoped: Args = { ...(args as Args) };

          if (FILTERED_OPERATIONS.has(operation)) {
            scoped.where = withTenant(scoped.where, tenantId);
          }

          if (CREATE_OPERATIONS.has(operation)) {
            const key = operation === 'upsert' ? 'create' : 'data';
            const data = scoped[key];

            scoped[key] = Array.isArray(data)
              ? data.map((row) => withTenant(row, tenantId))
              : withTenant(data, tenantId);
          }

          return query(scoped);
        },
      },
    },
  });

export type TenantClient = ReturnType<typeof createTenantClient>;
