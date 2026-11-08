import { corsOptions } from './cors.js';

describe('corsOptions', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('allows the origins listed in CORS_ORIGINS', () => {
    process.env.CORS_ORIGINS = 'https://crm.example.com, https://app.example.com';
    const check = vi.fn();

    corsOptions().origin('https://app.example.com', check);

    expect(check).toHaveBeenCalledWith(null, true);
  });

  it('refuses an origin that is not listed, without raising an error', () => {
    process.env.CORS_ORIGINS = 'https://crm.example.com';
    const check = vi.fn();

    corsOptions().origin('https://evil.example.com', check);

    expect(check).toHaveBeenCalledWith(null, false);
  });

  it('allows a request with no origin, such as curl or a webhook', () => {
    process.env.CORS_ORIGINS = 'https://crm.example.com';
    const check = vi.fn();

    corsOptions().origin(undefined, check);

    expect(check).toHaveBeenCalledWith(null, true);
  });

  it('refuses every browser origin when CORS_ORIGINS is unset', () => {
    const check = vi.fn();

    corsOptions().origin('https://crm.example.com', check);

    expect(check).toHaveBeenCalledWith(null, false);
  });

  it('sends credentials and the Authorization header', () => {
    const options = corsOptions();

    expect(options.credentials).toBe(true);
    expect(options.allowedHeaders).toContain('Authorization');
  });
});
