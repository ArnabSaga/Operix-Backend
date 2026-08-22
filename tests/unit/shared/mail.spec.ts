import { ConfigService } from '@nestjs/config';
import { TaskPriority } from '../../../generated/prisma/enums';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import { SMTP_TIMEOUT_MS } from '../../../src/shared/mail/mail.constant';
import { MailService } from '../../../src/shared/mail/mail.service';
import {
  escapeHtml,
  renderTaskAssignedEmail,
} from '../../../src/shared/mail/task-assigned-email.template';

const jestApi = import.meta.jest;

function createConfig(
  smtpOverrides: Partial<ApplicationConfiguration['smtp']> = {},
) {
  const configuration: ApplicationConfiguration = {
    app: {
      nodeEnvironment: 'test',
      port: 3000,
      frontendOrigins: ['http://localhost:3001'],
      frontendAppUrl: 'http://localhost:3001',
      swaggerEnabled: false,
    },
    database: {
      url: 'postgresql://postgres:postgres@localhost:5432/operix',
    },
    auth: {
      secret: 'test-secret-at-least-32-characters-long',
      baseUrl: 'http://localhost:3000',
    },
    smtp: {
      enabled: false,
      host: '',
      port: null,
      secure: false,
      user: '',
      pass: '',
      fromEmail: '',
      fromName: 'Operix',
      ...smtpOverrides,
    },
    fileStorage: {
      enabled: false,
      cloudinaryCloudName: '',
      cloudinaryApiKey: '',
      cloudinaryApiSecret: '',
      cloudinaryFolder: 'operix',
    },
  };

  return new ConfigService(configuration);
}

describe('mail templates', () => {
  it('escapes HTML and includes task assignment content', () => {
    const rendered = renderTaskAssignedEmail(
      {
        memberId: 'member-a',
        memberName: '<Member A>',
        memberEmail: 'member@example.com',
        taskId: 'task-a',
        referenceCode: 'TASK-20260821-ABC123',
        title: 'Batch <Review>',
        priority: TaskPriority.URGENT,
        dueAt: new Date('2026-08-22T10:00:00.000Z'),
        assignmentNote: 'Use <safe> notes.',
      },
      'https://app.operix.test',
    );

    expect(rendered.subject).toContain('TASK-20260821-ABC123');
    expect(rendered.text).toContain(
      'Open task: https://app.operix.test/tasks/task-a',
    );
    expect(rendered.text).toContain('Assignment note: Use <safe> notes.');
    expect(rendered.html).toContain('&lt;Member A&gt;');
    expect(rendered.html).toContain('Batch &lt;Review&gt;');
    expect(rendered.html).toContain('Use &lt;safe&gt; notes.');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
  });
});

describe('MailService', () => {
  it('is a safe no-op when SMTP is disabled', async () => {
    const service = new MailService(
      createConfig() as unknown as ConfigService<
        ApplicationConfiguration,
        true
      >,
    );

    await expect(
      service.sendTaskAssignedEmail({
        memberId: 'member-a',
        memberName: 'Member A',
        memberEmail: 'member@example.com',
        taskId: 'task-a',
        referenceCode: 'TASK-20260821-ABC123',
        title: 'Batch Review',
        priority: TaskPriority.HIGH,
        dueAt: null,
        assignmentNote: null,
      }),
    ).resolves.toBeUndefined();
  });

  it('exposes bounded timeout constants for SMTP transport creation', () => {
    expect(SMTP_TIMEOUT_MS).toEqual({
      CONNECTION: 10_000,
      GREETING: 10_000,
      SOCKET: 10_000,
    });
  });

  it('uses an enabled transporter when configured', async () => {
    const service = new MailService(
      createConfig({
        enabled: true,
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'user',
        pass: 'pass',
        fromEmail: 'noreply@example.com',
      }) as unknown as ConfigService<ApplicationConfiguration, true>,
    );
    const serviceInternals = service as unknown as {
      transporter: {
        sendMail: unknown;
      };
    };
    const sendMail = jestApi.fn().mockResolvedValue({});
    serviceInternals.transporter.sendMail = sendMail;

    await service.sendTaskAssignedEmail({
      memberId: 'member-a',
      memberName: 'Member A',
      memberEmail: 'member@example.com',
      taskId: 'task-a',
      referenceCode: 'TASK-20260821-ABC123',
      title: 'Batch Review',
      priority: TaskPriority.HIGH,
      dueAt: null,
      assignmentNote: null,
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          name: 'Member A',
          address: 'member@example.com',
        },
      }) as Record<string, unknown>,
    );
  });
});
