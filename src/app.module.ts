import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { fileURLToPath } from 'node:url';
import configuration from './config/configuration.js';
import { validateEnvironment } from './config/env.validation.js';
import { PrismaModule } from './database/prisma.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';
import { OperixAuthModule } from './modules/auth/auth.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ExportModule } from './modules/export/export.module.js';
import { FileModule } from './modules/file/file.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ImportModule } from './modules/import/import.module.js';
import { ManagementReportModule } from './modules/management-report/management-report.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { PerformanceModule } from './modules/performance/performance.module.js';
import { SubmissionModule } from './modules/submission/submission.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { TeamModule } from './modules/team/team.module.js';
import { UserManagementModule } from './modules/user-management/user-management.module.js';

const ENV_FILE_PATHS = [
  '.env',
  fileURLToPath(new URL('../.env', import.meta.url)),
  fileURLToPath(new URL('../../.env', import.meta.url)),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ENV_FILE_PATHS,
      load: [configuration],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.getOrThrow<number>('app.throttleTtlMs'),
          limit: config.getOrThrow<number>('app.throttleLimit'),
        },
      ],
    }),
    PrismaModule,
    OperixAuthModule,
    TeamModule,
    UserManagementModule,
    TaskModule,
    SubmissionModule,
    NotificationModule,
    ActivityModule,
    PerformanceModule,
    ManagementReportModule,
    DashboardModule,
    ImportModule,
    ExportModule,
    FileModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
