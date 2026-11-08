import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('never stores the plain password', async () => {
    const hash = await service.hash('adm');

    expect(hash).not.toContain('adm');
  });

  it('produces a different hash for the same password', async () => {
    const first = await service.hash('adm');
    const second = await service.hash('adm');

    expect(first).not.toBe(second);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash('adm');

    await expect(service.verify('adm', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('adm');

    await expect(service.verify('wrong', hash)).resolves.toBe(false);
  });

  it('rejects a malformed hash instead of throwing', async () => {
    await expect(service.verify('adm', 'not-a-hash')).resolves.toBe(false);
  });
});
