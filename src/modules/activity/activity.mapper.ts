import type { Prisma } from '../../../generated/prisma/client.js';
import type { SafeActivityResponse } from './activity.interface.js';
import { activitySelect } from './activity.select.js';

type SelectedActivity = Prisma.ActivityLogGetPayload<{
  select: typeof activitySelect;
}>;

export function mapActivityResponse(
  activity: SelectedActivity,
): SafeActivityResponse {
  return {
    id: activity.publicId,
    action: activity.action,
    entityType: activity.entityType,
    entityId: activity.entityPublicId,
    metadata: activity.metadata,
    createdAt: activity.createdAt,
    actor: activity.actor
      ? { id: activity.actor.publicId, name: activity.actor.name }
      : null,
  };
}
