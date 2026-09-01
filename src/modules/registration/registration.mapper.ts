import type { Prisma } from '../../../generated/prisma/client.js';
import { registrationRequestSelect } from './registration.select.js';

type SelectedRequest = Prisma.RegistrationRequestGetPayload<{
  select: typeof registrationRequestSelect;
}>;

export function mapRegistrationRequest(request: SelectedRequest) {
  return {
    id: request.publicId,
    name: request.name,
    email: request.normalizedEmail,
    status: request.status,
    selectedRole: request.selectedRole,
    selectedEmployeeId: request.selectedEmployeeId,
    selectedDesignation: request.selectedDesignation,
    selectedTeam: request.selectedTeam
      ? { id: request.selectedTeam.publicId, name: request.selectedTeam.name }
      : null,
    reviewer: request.reviewer
      ? { id: request.reviewer.publicId, name: request.reviewer.name }
      : null,
    rejectionReason: request.rejectionReason,
    reviewedAt: request.reviewedAt,
    approvedAt: request.approvedAt,
    passwordConfiguredAt: request.passwordConfiguredAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}
