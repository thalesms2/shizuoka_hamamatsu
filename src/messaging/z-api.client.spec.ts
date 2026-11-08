import { ServiceUnavailableException } from '@nestjs/common';
import { ZApiClient } from './z-api.client.js';

describe('ZApiClient', () => {
  const credentials = {
    instanceId: 'INST',
    token: 'TOK',
    clientToken: 'CLIENT',
  };

  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ok = (body: unknown) =>
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  it('posts to the documented instance URL', async () => {
    ok({ zaapId: 'z1', messageId: 'm1', id: 'm1' });

    await new ZApiClient().sendText(credentials, '5511999999999', 'oi');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.z-api.io/instances/INST/token/TOK/send-text',
    );
  });

  it('sends the Client-Token header', async () => {
    ok({ zaapId: 'z1', messageId: 'm1', id: 'm1' });

    await new ZApiClient().sendText(credentials, '5511999999999', 'oi');

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers['Client-Token']).toBe('CLIENT');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('sends phone and message in the body', async () => {
    ok({ zaapId: 'z1', messageId: 'm1', id: 'm1' });

    await new ZApiClient().sendText(credentials, '5511999999999', 'oi');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      phone: '5511999999999',
      message: 'oi',
    });
  });

  it('returns the message id reported by Z-API', async () => {
    ok({ zaapId: 'z1', messageId: 'm1', id: 'm1' });

    const result = await new ZApiClient().sendText(
      credentials,
      '5511999999999',
      'oi',
    );

    expect(result.messageId).toBe('m1');
  });

  it('turns an error response into a ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error":"null clientToken"}'),
    });

    await expect(
      new ZApiClient().sendText(credentials, '5511999999999', 'oi'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('turns a network failure into a ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      new ZApiClient().sendText(credentials, '5511999999999', 'oi'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('never puts the token in the exception message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    });

    const error = await new ZApiClient()
      .sendText(credentials, '5511999999999', 'oi')
      .catch((caught: Error) => caught);

    expect((error as Error).message).not.toContain('TOK');
    expect((error as Error).message).not.toContain('CLIENT');
  });
});
