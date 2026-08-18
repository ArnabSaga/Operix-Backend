import { HealthService } from '../../../src/modules/health/health.service';

describe('HealthService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns application liveness without checking dependencies', () => {
    const timestamp = new Date('2026-08-16T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(timestamp);
    const service = new HealthService();

    const result = service.getHealth();

    expect(result).toEqual({
      status: 'ok',
      service: 'operix-backend',
      timestamp: timestamp.toISOString(),
    });
  });
});
