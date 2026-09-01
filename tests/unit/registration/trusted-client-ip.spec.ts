import { getTrustedClientIp } from '../../../src/modules/registration/trusted-client-ip';

describe('getTrustedClientIp', () => {
  const originalVercel = process.env.VERCEL;

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  });

  it('uses the Vercel supplied forwarding header only on Vercel', () => {
    process.env.VERCEL = '1';
    const request = {
      header: (name: string) =>
        name === 'x-vercel-forwarded-for' ? '203.0.113.8, 10.0.0.1' : undefined,
      ip: '127.0.0.1',
      socket: {},
    };
    expect(getTrustedClientIp(request as never)).toBe('203.0.113.8');
  });

  it('ignores caller supplied Vercel forwarding headers outside Vercel', () => {
    delete process.env.VERCEL;
    const request = {
      header: () => '198.51.100.2',
      ip: '127.0.0.1',
      socket: {},
    };
    expect(getTrustedClientIp(request as never)).toBe('127.0.0.1');
  });
});
