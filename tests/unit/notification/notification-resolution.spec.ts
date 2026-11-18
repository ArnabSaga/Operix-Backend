import { resolveNotifications } from '../../../src/shared/notification/notification-resolution';

const jestApi = import.meta.jest;

describe('notification resolution', () => {
  it('resolves only unresolved notifications for the target and never touches readAt', async () => {
    const updateMany = jestApi.fn().mockResolvedValue({ count: 2 });
    const resolvedAt = new Date('2026-11-18T10:00:00.000Z');

    const resolved = await resolveNotifications(
      { notification: { updateMany } } as never,
      {
        targetType: 'REGISTRATION_REQUEST',
        targetId: 'request-internal-id',
        resolution: 'APPROVED',
        resolvedAt,
      },
    );

    expect(resolved).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        targetType: 'REGISTRATION_REQUEST',
        targetId: 'request-internal-id',
        resolvedAt: null,
      },
      data: {
        resolvedAt,
        resolution: 'APPROVED',
      },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('is idempotent because already resolved rows no longer match', async () => {
    const updateMany = jestApi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const tx = { notification: { updateMany } } as never;

    await resolveNotifications(tx, {
      targetType: 'REGISTRATION_REQUEST',
      targetId: 'request-internal-id',
      resolution: 'REJECTED',
    });
    const second = await resolveNotifications(tx, {
      targetType: 'REGISTRATION_REQUEST',
      targetId: 'request-internal-id',
      resolution: 'REJECTED',
    });

    expect(second).toBe(0);
  });
});
