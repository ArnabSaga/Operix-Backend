import { mapNotificationResponse } from '../../../src/modules/notification/notification.mapper';

const base = {
  publicId: 'notification-a',
  type: 'REGISTRATION_REQUESTED',
  title: 'New registration request',
  body: 'Arnab Dey submitted an access request.',
  targetType: 'REGISTRATION_REQUEST',
  targetPublicId: 'request-public-id',
  readAt: null,
  resolvedAt: null,
  resolution: null,
  createdAt: new Date('2026-11-18T10:00:00.000Z'),
  actor: null,
};

function map(overrides: Record<string, unknown> = {}) {
  return mapNotificationResponse({ ...base, ...overrides });
}

describe('notification action state', () => {
  it('stays actionable while the underlying job still needs a decision', () => {
    expect(map()).toMatchObject({
      actionState: 'ACTIONABLE',
      isRead: false,
      resolution: null,
      resolvedAt: null,
    });
  });

  it('keeps read and resolved independent for an unread resolved notification', () => {
    const resolvedAt = new Date('2026-11-18T11:00:00.000Z');
    const notification = map({
      resolvedAt,
      resolution: 'APPROVED',
      readAt: null,
    });

    expect(notification.actionState).toBe('RESOLVED');
    expect(notification.isRead).toBe(false);
    expect(notification.resolution).toBe('APPROVED');
    expect(notification.resolvedAt).toBe(resolvedAt);
  });

  it('still reports read for a resolved notification that was opened', () => {
    const notification = map({
      resolvedAt: new Date('2026-11-18T11:00:00.000Z'),
      resolution: 'REJECTED',
      readAt: new Date('2026-11-18T12:00:00.000Z'),
    });

    expect(notification).toMatchObject({
      actionState: 'RESOLVED',
      isRead: true,
      resolution: 'REJECTED',
    });
  });

  it('reports an unresolved reference as unavailable instead of actionable', () => {
    expect(map({ targetPublicId: null }).actionState).toBe('UNAVAILABLE');
  });

  it('reports a notification without any target as unavailable', () => {
    expect(map({ targetType: null, targetPublicId: null }).actionState).toBe(
      'UNAVAILABLE',
    );
  });
});
