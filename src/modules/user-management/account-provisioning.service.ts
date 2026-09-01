import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  UserStatus,
  type UserRole as UserRoleValue,
} from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AppException } from '../../shared/errors/app.exception.js';
import { createOperixProvisioningAuth } from '../auth/auth.factory.js';
import { adminSelect } from './admin/admin.select.js';
import { USER_MANAGEMENT_ERROR_CODE } from './user-management.constant.js';
import type { SelectedSafeUser } from './user-management.mapper.js';

export interface AccountProvisioningInput {
  name: string;
  email: string;
  initialPassword: string;
  employeeId?: string | null;
  designation?: string | null;
  role: Extract<UserRoleValue, 'ADMIN' | 'MEMBER'>;
  status?: UserStatus;
  registrationRequestId?: string | null;
  passwordSetupRequired?: boolean;
}

@Injectable()
export class AccountProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async provisionAccount(
    input: AccountProvisioningInput,
  ): Promise<SelectedSafeUser> {
    await this.assertEmailAvailable(input.email);
    await this.assertEmployeeIdAvailable(input.employeeId ?? null);

    const provisioning = createOperixProvisioningAuth({
      prisma: this.prisma,
      baseUrl: this.config.getOrThrow<string>('auth.baseUrl'),
      secret: this.config.getOrThrow<string>('auth.secret'),
      forcedRole: input.role,
      forcedStatus: input.status,
    });

    await provisioning.auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.initialPassword,
        name: input.name,
      },
    });

    const createdUserId = provisioning.getCreatedUserId();

    if (!createdUserId) {
      await this.throwProvisioningPostconditionError(input.email);
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.ACCOUNT_PROVISIONING_FAILED,
        'Account provisioning failed.',
      );
    }

    const createdUser = await this.prisma.user.findUnique({
      where: {
        id: createdUserId,
      },
      select: adminSelect,
    });

    if (createdUser?.role !== input.role) {
      await this.cleanupCreatedUser(createdUserId);

      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.ACCOUNT_PROVISIONING_FAILED,
        'Account provisioning failed.',
      );
    }

    try {
      return await this.prisma.user.update({
        where: {
          id: createdUserId,
        },
        data: {
          employeeId: input.employeeId ?? null,
          designation: input.designation ?? null,
          status: input.status ?? UserStatus.ACTIVE,
          registrationRequestId: input.registrationRequestId ?? null,
          passwordSetupRequired: input.passwordSetupRequired ?? false,
        },
        select: adminSelect,
      });
    } catch (error) {
      await this.cleanupCreatedUser(createdUserId);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          HttpStatus.CONFLICT,
          USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS,
          'Employee ID already exists.',
        );
      }

      throw error;
    }
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.EMAIL_ALREADY_EXISTS,
        'Email already exists.',
      );
    }
  }

  private async assertEmployeeIdAvailable(
    employeeId: string | null,
  ): Promise<void> {
    if (!employeeId) {
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: {
        employeeId,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.EMPLOYEE_ID_ALREADY_EXISTS,
        'Employee ID already exists.',
      );
    }
  }

  private async throwProvisioningPostconditionError(
    email: string,
  ): Promise<never> {
    const existing = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new AppException(
        HttpStatus.CONFLICT,
        USER_MANAGEMENT_ERROR_CODE.EMAIL_ALREADY_EXISTS,
        'Email already exists.',
      );
    }

    throw new AppException(
      HttpStatus.CONFLICT,
      USER_MANAGEMENT_ERROR_CODE.ACCOUNT_PROVISIONING_FAILED,
      'Account provisioning failed.',
    );
  }

  async cleanupCreatedUser(userId: string): Promise<void> {
    await this.prisma.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }
}
