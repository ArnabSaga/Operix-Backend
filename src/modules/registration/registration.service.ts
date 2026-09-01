import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  RegistrationRequestStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums.js';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { PrismaService } from '../../database/prisma.service.js';
import { writeActivity } from '../../shared/activity/activity-write.js';
import type { OperixViewer } from '../../shared/auth/viewer.interface.js';
import { runSerializableTransaction } from '../../shared/database/serializable-transaction.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { MailService } from '../../shared/mail/mail.service.js';
import {
  createPaginationMeta,
  normalizePagination,
} from '../../shared/pagination/pagination.helper.js';
import { OperixAuthService } from '../auth/auth.service.js';
import { AccountProvisioningService } from '../user-management/account-provisioning.service.js';
import { USER_MANAGEMENT_ERROR_CODE } from '../user-management/user-management.constant.js';
import type { ApproveRegistrationRequestDto } from './dto/approve-registration-request.dto.js';
import type { CreateRegistrationRequestDto } from './dto/create-registration-request.dto.js';
import type { RegistrationRequestQueryDto } from './dto/registration-request-query.dto.js';
import type { RejectRegistrationRequestDto } from './dto/reject-registration-request.dto.js';
import {
  REGISTRATION_ACTIVITY,
  REGISTRATION_APPROVAL_CLAIM_TIMEOUT_MS,
  REGISTRATION_CLEANUP_BATCH_SIZE,
  REGISTRATION_ERROR_CODE,
  REGISTRATION_GENERIC_RESPONSE,
  REGISTRATION_NOTIFICATION,
  REGISTRATION_RATE_LIMIT,
  REGISTRATION_REJECTION_COOLDOWN_MS,
  REGISTRATION_RETENTION_MS,
  REGISTRATION_THROTTLE_RETENTION_MS,
} from './registration.constant.js';
import { mapRegistrationRequest } from './registration.mapper.js';
import { registrationRequestSelect } from './registration.select.js';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<ApplicationConfiguration, true>,
    private readonly mailService: MailService,
    private readonly provisioner: AccountProvisioningService,
    private readonly authService: OperixAuthService,
  ) {}

  async createPublicRequest(
    dto: CreateRegistrationRequestDto,
    clientIp: string,
  ) {
    await this.consumeRateLimit(clientIp);
    const normalizedEmail = dto.email.trim().toLowerCase();
    const cutoff = new Date(Date.now() - REGISTRATION_REJECTION_COOLDOWN_MS);

    const [existingUser, blockingRequest] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      }),
      this.prisma.registrationRequest.findFirst({
        where: {
          normalizedEmail,
          OR: [
            {
              status: {
                in: [
                  RegistrationRequestStatus.PENDING,
                  RegistrationRequestStatus.APPROVING,
                  RegistrationRequestStatus.APPROVED,
                ],
              },
            },
            {
              status: RegistrationRequestStatus.REJECTED,
              rejectedAt: { gte: cutoff },
            },
          ],
        },
        select: { id: true },
      }),
    ]);

    if (existingUser || blockingRequest) return REGISTRATION_GENERIC_RESPONSE;

    try {
      const created = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const request = await tx.registrationRequest.create({
            data: { name: dto.name.trim(), normalizedEmail },
            select: {
              id: true,
              publicId: true,
              name: true,
              normalizedEmail: true,
            },
          });

          await writeActivity(tx, {
            actorId: null,
            action: REGISTRATION_ACTIVITY.REQUESTED,
            entityType: 'REGISTRATION_REQUEST',
            entityId: request.id,
          });

          const reviewers = await tx.user.findMany({
            where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
            select: { id: true },
          });
          if (reviewers.length > 0) {
            await tx.notification.createMany({
              data: reviewers.map((reviewer) => ({
                receiverId: reviewer.id,
                actorId: null,
                type: REGISTRATION_NOTIFICATION.REQUESTED,
                title: 'New registration request',
                body: `${request.name} submitted an access request.`,
                targetType: 'REGISTRATION_REQUEST',
                targetId: request.id,
                targetPublicId: request.publicId,
              })),
            });
          } else {
            this.logger.error(
              'Registration request created without an active reviewer.',
              {
                eventId: request.publicId,
              },
            );
          }
          return request;
        },
      );

      void this.mailService
        .sendRegistrationReceivedEmail({
          requestId: created.publicId,
          recipientName: created.name,
          email: created.normalizedEmail,
        })
        .catch((error: unknown) =>
          this.logMailFailure('registration-received', created.publicId, error),
        );
    } catch (error) {
      if (isUniqueConflict(error)) return REGISTRATION_GENERIC_RESPONSE;
      throw error;
    }

    return REGISTRATION_GENERIC_RESPONSE;
  }

  async list(query: RegistrationRequestQueryDto) {
    const pagination = normalizePagination(query);
    const q = query.q?.trim();
    const where: Prisma.RegistrationRequestWhereInput = {
      ...(query.status === RegistrationRequestStatus.PENDING
        ? { status: { in: [RegistrationRequestStatus.PENDING, RegistrationRequestStatus.APPROVING] } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              {
                normalizedEmail: {
                  contains: q.toLowerCase(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.registrationRequest.findMany({
        where,
        select: registrationRequestSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.registrationRequest.count({ where }),
    ]);
    return {
      data: data.map(mapRegistrationRequest),
      meta: createPaginationMeta({
        page: pagination.page,
        limit: pagination.limit,
        total,
      }),
    };
  }

  async get(requestId: string) {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { publicId: requestId },
      select: registrationRequestSelect,
    });
    if (!request) throw this.notFound();
    return mapRegistrationRequest(request);
  }

  async approve(
    viewer: OperixViewer,
    requestId: string,
    dto: ApproveRegistrationRequestDto,
  ) {
    const recovered = await this.reconcileStaleApproval(requestId);
    if (recovered) return recovered;
    this.validateApproval(dto);
    const teamId = dto.teamId ? await this.resolveTeam(dto.teamId) : null;
    const claimId = randomUUID();
    const request = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const current = await tx.registrationRequest.findUnique({
          where: { publicId: requestId },
          select: { id: true, status: true, name: true, normalizedEmail: true },
        });
        if (!current) throw this.notFound();
        if (current.status === RegistrationRequestStatus.APPROVING) {
          throw new AppException(
            HttpStatus.CONFLICT,
            REGISTRATION_ERROR_CODE.APPROVAL_IN_PROGRESS,
            'Registration approval is in progress.',
          );
        }
        if (current.status !== RegistrationRequestStatus.PENDING)
          throw this.notPending();
        const now = new Date();
        await tx.registrationRequest.update({
          where: { id: current.id },
          data: {
            status: RegistrationRequestStatus.APPROVING,
            approvalClaimId: claimId,
            approvalClaimedAt: now,
            selectedRole: dto.role,
            selectedEmployeeId: dto.employeeId ?? null,
            selectedDesignation: dto.designation ?? null,
            selectedTeamId: teamId,
            reviewerId: viewer.userId,
          },
        });
        return current;
      },
    );

    let user: Awaited<
      ReturnType<AccountProvisioningService['provisionAccount']>
    >;
    try {
      user = await this.provisioner.provisionAccount({
        name: request.name,
        email: request.normalizedEmail,
        initialPassword: randomBytes(32).toString('base64url'),
        employeeId: dto.employeeId ?? null,
        designation: dto.designation ?? null,
        role: dto.role as Extract<UserRole, 'ADMIN' | 'MEMBER'>,
        status: UserStatus.INACTIVE,
        registrationRequestId: request.id,
        passwordSetupRequired: true,
      });
    } catch (error) {
      if (
        hasErrorCode(error, USER_MANAGEMENT_ERROR_CODE.EMAIL_ALREADY_EXISTS)
      ) {
        await this.rejectClaimForUnavailableEmail(
          request.id,
          claimId,
          viewer.userId,
        );
        void this.mailService
          .sendRegistrationRejectedEmail({
            requestId,
            recipientName: request.name,
            email: request.normalizedEmail,
          })
          .catch((mailError: unknown) =>
            this.logMailFailure('registration-rejected', requestId, mailError),
          );
      } else {
        await this.restoreClaim(request.id, claimId);
      }
      throw this.mapProvisioningError(error);
    }

    try {
      const finalized = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          const current = await tx.registrationRequest.findFirst({
            where: {
              id: request.id,
              status: RegistrationRequestStatus.APPROVING,
              approvalClaimId: claimId,
            },
            select: { id: true },
          });
          if (!current)
            throw new AppException(
              HttpStatus.CONFLICT,
              APP_ERROR_CODE.CONCURRENT_MODIFICATION,
              'Registration approval changed while processing.',
            );
          const internalUser = await tx.user.findFirst({
            where: { publicId: user.id, registrationRequestId: request.id },
            select: { id: true },
          });
          if (!internalUser)
            throw new AppException(
              HttpStatus.CONFLICT,
              APP_ERROR_CODE.CONCURRENT_MODIFICATION,
              'Provisioned account could not be reconciled.',
            );
          if (dto.role === UserRole.MEMBER && teamId) {
            await tx.teamMember.create({
              data: { teamId, memberId: internalUser.id },
            });
          }
          const now = new Date();
          await writeActivity(tx, {
            actorId: viewer.userId,
            action: REGISTRATION_ACTIVITY.APPROVED,
            entityType: 'REGISTRATION_REQUEST',
            entityId: request.id,
          });
          return tx.registrationRequest.update({
            where: { id: request.id },
            data: {
              status: RegistrationRequestStatus.APPROVED,
              approvedAt: now,
              reviewedAt: now,
              approvalClaimId: null,
              approvalClaimedAt: null,
            },
            select: registrationRequestSelect,
          });
        },
      );
      void this.authService
        .requestPasswordSetup(request.normalizedEmail)
        .catch((error: unknown) =>
          this.logMailFailure('account-setup', requestId, error),
        );
      return mapRegistrationRequest(finalized);
    } catch (error) {
      try {
        const internal = await this.prisma.user.findUnique({
          where: { publicId: user.id },
          select: { id: true },
        });
        if (internal) await this.provisioner.cleanupCreatedUser(internal.id);
        await this.restoreClaim(request.id, claimId);
      } catch {
        this.logger.error(
          'Registration approval compensation requires reconciliation.',
          { eventId: requestId },
        );
      }
      throw error;
    }
  }

  async reject(
    viewer: OperixViewer,
    requestId: string,
    dto: RejectRegistrationRequestDto,
  ) {
    const updated = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const current = await tx.registrationRequest.findUnique({
          where: { publicId: requestId },
          select: { id: true, status: true, name: true, normalizedEmail: true },
        });
        if (!current) throw this.notFound();
        if (current.status !== RegistrationRequestStatus.PENDING)
          throw this.notPending();
        const now = new Date();
        await writeActivity(tx, {
          actorId: viewer.userId,
          action: REGISTRATION_ACTIVITY.REJECTED,
          entityType: 'REGISTRATION_REQUEST',
          entityId: current.id,
        });
        const result = await tx.registrationRequest.update({
          where: { id: current.id },
          data: {
            status: RegistrationRequestStatus.REJECTED,
            rejectionCode: 'MANUAL_REJECTION',
            rejectionReason: dto.reason,
            reviewerId: viewer.userId,
            reviewedAt: now,
            rejectedAt: now,
          },
          select: registrationRequestSelect,
        });
        return { result, mail: current };
      },
    );
    void this.mailService
      .sendRegistrationRejectedEmail({
        requestId,
        recipientName: updated.mail.name,
        email: updated.mail.normalizedEmail,
      })
      .catch((error: unknown) =>
        this.logMailFailure('registration-rejected', requestId, error),
      );
    return mapRegistrationRequest(updated.result);
  }

  async resendSetup(viewer: OperixViewer, requestId: string) {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { publicId: requestId },
      select: {
        id: true,
        status: true,
        normalizedEmail: true,
        approvedUser: { select: { status: true, passwordSetupRequired: true } },
      },
    });
    if (!request) throw this.notFound();
    if (
      request.status !== RegistrationRequestStatus.APPROVED ||
      request.approvedUser?.status !== UserStatus.INACTIVE ||
      !request.approvedUser.passwordSetupRequired
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        REGISTRATION_ERROR_CODE.SETUP_ALREADY_COMPLETED,
        'Account setup is not available for this request.',
      );
    }
    await this.prisma.$transaction(async (tx) =>
      writeActivity(tx, {
        actorId: viewer.userId,
        action: REGISTRATION_ACTIVITY.SETUP_RESENT,
        entityType: 'REGISTRATION_REQUEST',
        entityId: request.id,
      }),
    );
    void this.authService
      .requestPasswordSetup(request.normalizedEmail)
      .catch((error: unknown) =>
        this.logMailFailure('account-setup', requestId, error),
      );
    return { message: 'A new account setup link was requested.' };
  }

  async cleanup() {
    const terminalCutoff = new Date(Date.now() - REGISTRATION_RETENTION_MS);
    const throttleCutoff = new Date(
      Date.now() - REGISTRATION_THROTTLE_RETENTION_MS,
    );
    const eligible = await this.prisma.registrationRequest.findMany({
      where: {
        OR: [
          {
            status: RegistrationRequestStatus.REJECTED,
            rejectedAt: { lt: terminalCutoff },
          },
          {
            status: RegistrationRequestStatus.APPROVED,
            passwordConfiguredAt: { lt: terminalCutoff },
            approvedUser: { passwordSetupRequired: false },
          },
        ],
      },
      select: { id: true, status: true },
      take: REGISTRATION_CLEANUP_BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });
    let purgedRegistrations = 0;
    for (const request of eligible) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.updateMany({
          where: { registrationRequestId: request.id },
          data: { registrationRequestId: null },
        });
        await tx.notification.deleteMany({
          where: { targetType: 'REGISTRATION_REQUEST', targetId: request.id },
        });
        await tx.activityLog.updateMany({
          where: { entityType: 'REGISTRATION_REQUEST', entityId: request.id },
          data: { entityId: null, entityPublicId: null },
        });
        await writeActivity(tx, {
          actorId: null,
          action: REGISTRATION_ACTIVITY.PURGED,
          entityType: 'REGISTRATION_REQUEST',
          metadata: { terminalStatus: request.status },
        });
        await tx.registrationRequest.delete({ where: { id: request.id } });
      });
      purgedRegistrations += 1;
    }
    const deletedBuckets =
      await this.prisma.registrationThrottleBucket.deleteMany({
        where: { expiresAt: { lt: throttleCutoff } },
      });
    return { purgedRegistrations, purgedThrottleBuckets: deletedBuckets.count };
  }

  isValidCronAuthorization(authorization: string | undefined): boolean {
    const expected = `Bearer ${this.config.get('registration.cronSecret', { infer: true })}`;
    if (!authorization) return false;
    const actualBuffer = Buffer.from(authorization);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private async consumeRateLimit(clientIp: string): Promise<void> {
    const secret = this.config.get('registration.rateLimitSecret', {
      infer: true,
    });
    const ipHash = createHmac('sha256', secret).update(clientIp).digest('hex');
    const now = new Date();
    const hourBucketStart = new Date(now);
    hourBucketStart.setUTCMinutes(0, 0, 0);
    const expiresAt = new Date(hourBucketStart.getTime() + 60 * 60 * 1000);
    const bucket = await this.prisma.registrationThrottleBucket.upsert({
      where: { ipHash_hourBucketStart: { ipHash, hourBucketStart } },
      create: { ipHash, hourBucketStart, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    if (bucket.count > REGISTRATION_RATE_LIMIT) {
      const retryAfter = Math.max(
        1,
        Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        REGISTRATION_ERROR_CODE.RATE_LIMITED,
        'Too many registration requests.',
        { retryAfter },
      );
    }
  }

  private validateApproval(dto: ApproveRegistrationRequestDto): void {
    if (dto.role !== UserRole.ADMIN && dto.role !== UserRole.MEMBER) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        REGISTRATION_ERROR_CODE.INVALID_ROLE,
        'Role must be ADMIN or MEMBER.',
      );
    }
    if (dto.role === UserRole.ADMIN && dto.teamId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        REGISTRATION_ERROR_CODE.INVALID_ROLE,
        'A Team can only be selected for a Member.',
      );
    }
  }

  private async resolveTeam(publicId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { publicId },
      select: { id: true },
    });
    if (!team)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        REGISTRATION_ERROR_CODE.TEAM_NOT_FOUND,
        'Team not found.',
      );
    return team.id;
  }

  private async restoreClaim(id: string, claimId: string): Promise<void> {
    await this.prisma.registrationRequest.updateMany({
      where: {
        id,
        status: RegistrationRequestStatus.APPROVING,
        approvalClaimId: claimId,
      },
      data: {
        status: RegistrationRequestStatus.PENDING,
        approvalClaimId: null,
        approvalClaimedAt: null,
        selectedRole: null,
        selectedEmployeeId: null,
        selectedDesignation: null,
        selectedTeamId: null,
        reviewerId: null,
      },
    });
  }

  private async reconcileStaleApproval(requestId: string) {
    const staleBefore = new Date(
      Date.now() - REGISTRATION_APPROVAL_CLAIM_TIMEOUT_MS,
    );
    const stale = await this.prisma.registrationRequest.findFirst({
      where: {
        publicId: requestId,
        status: RegistrationRequestStatus.APPROVING,
        approvalClaimedAt: { lt: staleBefore },
        approvalClaimId: { not: null },
      },
      select: {
        id: true,
        approvalClaimId: true,
        selectedRole: true,
        selectedTeamId: true,
        reviewerId: true,
        normalizedEmail: true,
        approvedUser: { select: { id: true } },
      },
    });
    if (!stale?.approvalClaimId) return null;
    if (!stale.approvedUser) {
      await this.restoreClaim(stale.id, stale.approvalClaimId);
      return null;
    }
    const approvedUserId = stale.approvedUser.id;
    if (!stale.selectedRole || !stale.reviewerId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        APP_ERROR_CODE.CONCURRENT_MODIFICATION,
        'Registration approval requires internal reconciliation.',
      );
    }
    const finalized = await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const owned = await tx.registrationRequest.findFirst({
          where: {
            id: stale.id,
            status: RegistrationRequestStatus.APPROVING,
            approvalClaimId: stale.approvalClaimId,
          },
          select: { id: true },
        });
        if (!owned) {
          throw new AppException(
            HttpStatus.CONFLICT,
            APP_ERROR_CODE.CONCURRENT_MODIFICATION,
            'Registration approval changed while recovering.',
          );
        }
        if (stale.selectedRole === UserRole.MEMBER && stale.selectedTeamId) {
          await tx.teamMember.upsert({
            where: { memberId: approvedUserId },
            create: {
              memberId: approvedUserId,
              teamId: stale.selectedTeamId,
            },
            update: {},
          });
        }
        await writeActivity(tx, {
          actorId: stale.reviewerId,
          action: REGISTRATION_ACTIVITY.APPROVED,
          entityType: 'REGISTRATION_REQUEST',
          entityId: stale.id,
        });
        const now = new Date();
        return tx.registrationRequest.update({
          where: { id: stale.id },
          data: {
            status: RegistrationRequestStatus.APPROVED,
            reviewedAt: now,
            approvedAt: now,
            approvalClaimId: null,
            approvalClaimedAt: null,
          },
          select: registrationRequestSelect,
        });
      },
    );
    void this.authService
      .requestPasswordSetup(stale.normalizedEmail)
      .catch((error: unknown) =>
        this.logMailFailure('account-setup', requestId, error),
      );
    return mapRegistrationRequest(finalized);
  }

  private async rejectClaimForUnavailableEmail(
    id: string,
    claimId: string,
    reviewerId: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.registrationRequest.updateMany({
      where: {
        id,
        status: RegistrationRequestStatus.APPROVING,
        approvalClaimId: claimId,
      },
      data: {
        status: RegistrationRequestStatus.REJECTED,
        rejectionCode: 'EMAIL_UNAVAILABLE',
        rejectionReason: null,
        reviewerId,
        reviewedAt: now,
        rejectedAt: now,
        approvalClaimId: null,
        approvalClaimedAt: null,
      },
    });
  }

  private mapProvisioningError(error: unknown): Error {
    if (hasErrorCode(error, USER_MANAGEMENT_ERROR_CODE.EMAIL_ALREADY_EXISTS)) {
      return new AppException(
        HttpStatus.CONFLICT,
        REGISTRATION_ERROR_CODE.EMAIL_UNAVAILABLE,
        'Registration email is unavailable.',
      );
    }
    if (
      hasErrorCode(error, USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS)
    ) {
      return new AppException(
        HttpStatus.CONFLICT,
        REGISTRATION_ERROR_CODE.EMPLOYEE_ID_CONFLICT,
        'Employee ID already exists.',
      );
    }
    return error instanceof Error
      ? error
      : new Error('Unexpected registration provisioning error.');
  }

  private notFound() {
    return new AppException(
      HttpStatus.NOT_FOUND,
      REGISTRATION_ERROR_CODE.NOT_FOUND,
      'Registration request not found.',
    );
  }

  private notPending() {
    return new AppException(
      HttpStatus.CONFLICT,
      REGISTRATION_ERROR_CODE.NOT_PENDING,
      'Registration request is not pending.',
    );
  }

  private logMailFailure(
    template: string,
    eventId: string,
    error: unknown,
  ): void {
    this.logger.warn('Registration email delivery failed.', {
      template,
      eventId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  get claimTimeoutMs(): number {
    return REGISTRATION_APPROVAL_CLAIM_TIMEOUT_MS;
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function hasErrorCode(error: unknown, code: string): boolean {
  if (!(error instanceof AppException)) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    response.code === code
  );
}
