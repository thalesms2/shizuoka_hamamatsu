import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  const createService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    return moduleRef.get(PrismaService);
  };

  it('connects on module init', async () => {
    const service = await createService();
    const connect = vi
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined as never);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledOnce();
  });

  it('disconnects on module destroy', async () => {
    const service = await createService();
    const disconnect = vi
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined as never);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledOnce();
  });
});
