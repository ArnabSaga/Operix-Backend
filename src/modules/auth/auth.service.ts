import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { APP_ERROR_CODE } from '../../shared/errors/app-error-code.constant.js';
import { AppException } from '../../shared/errors/app.exception.js';
import type {
  OperixViewer,
  OperixViewerResponse,
} from '../../shared/auth/viewer.interface.js';
import type { OperixViewerScope } from '../../shared/auth/scope/viewer-scope.interface.js';
import { MailService } from '../../shared/mail/mail.service.js';
import { createOperixAuth } from './auth.factory.js';

@Injectable()
export class OperixAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  async requestPasswordSetup(email: string): Promise<void> {
    if (!this.config || !this.mailService) {
      throw new Error('Authentication mail integration is unavailable.');
    }
    const auth = createOperixAuth(this.prisma, this.config, this.mailService);
    await auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: new URL(
          '/setup-password',
          this.config.getOrThrow<string>('app.frontendAppUrl'),
        ).toString(),
      },
    });
  }

  async getViewer(userId: string): Promise<OperixViewer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        administeredTeams: {
          select: {
            id: true,
          },
        },
        teamMembership: {
          select: {
            teamId: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        APP_ERROR_CODE.AUTH_REQUIRED,
        'Authentication required.',
      );
    }

    return {
      userId: user.id,
      role: user.role,
      status: user.status,
      scope: this.resolveScope({
        role: user.role,
        administeredTeamIds: user.administeredTeams.map((team) => team.id),
        memberTeamId: user.teamMembership?.teamId ?? null,
      }),
    };
  }

  async getViewerResponse(userId: string): Promise<OperixViewerResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        publicId: true,
        role: true,
        status: true,
        administeredTeams: { select: { publicId: true } },
        teamMembership: { select: { team: { select: { publicId: true } } } },
      },
    });

    if (!user) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        APP_ERROR_CODE.AUTH_REQUIRED,
        'Authentication required.',
      );
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return {
        userId: user.publicId,
        role: user.role,
        status: user.status,
        scope: { type: 'GLOBAL' },
      };
    }

    if (user.role === UserRole.ADMIN) {
      return {
        userId: user.publicId,
        role: user.role,
        status: user.status,
        scope: {
          type: 'ADMIN',
          teamIds: user.administeredTeams.map((team) => team.publicId),
        },
      };
    }

    return {
      userId: user.publicId,
      role: user.role,
      status: user.status,
      scope: {
        type: 'MEMBER',
        teamId: user.teamMembership?.team.publicId ?? null,
      },
    };
  }

  resolveScope(input: {
    role: UserRole;
    administeredTeamIds: string[];
    memberTeamId: string | null;
  }): OperixViewerScope {
    if (input.role === UserRole.SUPER_ADMIN) {
      return { type: 'GLOBAL' };
    }

    if (input.role === UserRole.ADMIN) {
      return {
        type: 'ADMIN',
        teamIds: input.administeredTeamIds,
      };
    }

    return {
      type: 'MEMBER',
      teamId: input.memberTeamId,
    };
  }
}
