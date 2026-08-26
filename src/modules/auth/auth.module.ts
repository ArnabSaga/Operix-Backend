import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { PrismaModule } from '../../database/prisma.module.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MailModule } from '../../shared/mail/mail.module.js';
import { MailService } from '../../shared/mail/mail.service.js';
import { AccountStatusGuard } from '../../shared/auth/account-status.guard.js';
import { OperixRoleGuard } from '../../shared/auth/operix-role.guard.js';
import { ViewerContextGuard } from '../../shared/auth/viewer-context.guard.js';
import { OperixAuthController } from './auth.controller.js';
import { createOperixAuth } from './auth.factory.js';
import { OperixAuthService } from './auth.service.js';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule.forRootAsync({
      imports: [PrismaModule, MailModule],
      inject: [PrismaService, ConfigService, MailService],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        mailService: MailService,
      ) => ({
        auth: createOperixAuth(prisma, config, mailService),
        bodyParser: {
          json: {
            limit: '2mb',
          },
          urlencoded: {
            extended: true,
            limit: '2mb',
          },
        },
      }),
    }),
  ],
  controllers: [OperixAuthController],
  providers: [
    OperixAuthService,
    ViewerContextGuard,
    AccountStatusGuard,
    OperixRoleGuard,
  ],
  exports: [
    OperixAuthService,
    ViewerContextGuard,
    AccountStatusGuard,
    OperixRoleGuard,
  ],
})
export class OperixAuthModule {}
