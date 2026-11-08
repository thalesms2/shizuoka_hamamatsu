import { AccessHistoriesService } from './access-histories.service.js';
import { AccessOperation } from './access-operation.enum.js';

describe('AccessHistoriesService', () => {
  const buildPrisma = () => ({ accessHistory: { create: vi.fn() } });

  it('records the operation for a user inside their tenant', async () => {
    const prisma = buildPrisma();

    await new AccessHistoriesService(prisma as never).record(
      't1',
      'u1',
      AccessOperation.Login,
    );

    expect(prisma.accessHistory.create).toHaveBeenCalledWith({
      data: { tenantId: 't1', userId: 'u1', operation: AccessOperation.Login },
    });
  });
});
