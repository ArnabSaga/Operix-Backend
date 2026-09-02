import { ConfigService } from '@nestjs/config';
import { TaskPriority } from '../../../generated/prisma/enums';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { SMTP_TIMEOUT_MS } from '../../../src/shared/mail/mail.constant';
import { MAIL_TEMPLATE } from '../../../src/shared/mail/mail-template.constant';
import { MailTemplateRenderer } from '../../../src/shared/mail/mail-template.renderer';
import { MailService } from '../../../src/shared/mail/mail.service';

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
      throttleTtlMs: 60_000,
      throttleLimit: 100,
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
    registration: {
      rateLimitSecret: 'registration-rate-limit-secret-32-characters',
      cronSecret: 'registration-cron-secret-32-characters-long',
    },
  };

  return new ConfigService(configuration);
}

function getAppErrorCode(error: unknown): string | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('getResponse' in error) ||
    typeof error.getResponse !== 'function'
  ) {
    return undefined;
  }

  const getResponse = error.getResponse as () => unknown;
  const response = getResponse.call(error) as { code?: string };
  return response.code;
}

describe('MailTemplateRenderer', () => {
  it('renders the branded notification with escaped details and a text CTA URL', async () => {
    const renderer = new MailTemplateRenderer();
    const rendered = await renderer.render(MAIL_TEMPLATE.NOTIFICATION_ALERT, {
      recipientName: '<Member A>',
      heading: 'New task assigned',
      message: 'Review <safe> content.',
      details: [
        { label: 'Task', value: 'Batch <Review>' },
        { label: 'Priority', value: 'HIGH' },
      ],
      actionLabel: 'Open Task',
      actionUrl: 'https://app.operix.test/tasks/task-a',
    });

    expect(rendered.html).toContain('&lt;Member A&gt;');
    expect(rendered.html).toContain('Batch &lt;Review&gt;');
    expect(rendered.html).toContain('You have a new update waiting in Operix.');
    expect(rendered.html).toContain('Operix update');
    expect(rendered.html).toContain('style="');
    expect(rendered.text).not.toContain(
      'You have a new update waiting in Operix.',
    );
    expect(rendered.text).toContain('Open Task');
    expect(rendered.text).toContain('https://app.operix.test/tasks/task-a');
    expect(rendered.text).toContain(
      'This is an automated message from Operix.',
    );
  });

  it('omits the notification CTA when no action is supplied', async () => {
    const rendered = await new MailTemplateRenderer().render(
      MAIL_TEMPLATE.NOTIFICATION_ALERT,
      {
        recipientName: 'Member A',
        heading: 'Workflow updated',
        message: 'Your workflow has changed.',
        details: [],
        actionLabel: null,
        actionUrl: null,
      },
    );

    expect(rendered.text).toContain('WORKFLOW UPDATED');
    expect(rendered.text).not.toContain('Open Task');
    expect(rendered.html).not.toContain('class="email-button"');
  });

  it('renders Welcome with safe account details and no password content', async () => {
    const renderer = new MailTemplateRenderer();

    const welcome = await renderer.render(MAIL_TEMPLATE.WELCOME_USER, {
      recipientName: 'Admin A',
      accountEmail: 'admin@example.com',
      roleLabel: 'Admin',
      loginUrl: 'https://app.operix.test/login',
    });

    expect(welcome.text).toContain('Account created');
    expect(welcome.text).toContain('admin@example.com');
    expect(welcome.text).toContain('Admin');
    expect(welcome.text).toContain('Sign In to Operix');
    expect(welcome.text).toContain('https://app.operix.test/login');
    expect(welcome.text.toLowerCase()).not.toContain('initialpassword');
    expect(welcome.text.toLowerCase()).not.toContain('temporary password');
    expect(welcome.text.toLowerCase()).not.toContain('password:');
  });

  it('renders Password Reset with expiry, fallback URL, and security guidance', async () => {
    const reset = await new MailTemplateRenderer().render(
      MAIL_TEMPLATE.PASSWORD_RESET,
      {
        recipientName: 'Admin A',
        resetUrl: 'https://api.operix.test/api/v1/auth/reset-password/token',
        expiryHours: 24,
      },
    );

    expect(reset.text).toContain('Security request');
    expect(reset.text).toContain('Reset Password');
    expect(reset.text).toContain('24 hours');
    expect(reset.text).toContain('Did not request this?');
    expect(reset.text).toContain(
      'https://api.operix.test/api/v1/auth/reset-password/token',
    );
  });

  it('renders Account Setup with approval, expiry, fallback URL, and security guidance', async () => {
    const rendered = await new MailTemplateRenderer().render(
      MAIL_TEMPLATE.ACCOUNT_SETUP,
      {
        recipientName: 'Applicant A',
        setupUrl: 'https://app.operix.test/setup-password?token=safe',
        expiryHours: 24,
      },
    );

    expect(rendered.text).toContain('Access approved');
    expect(rendered.text).toContain('Set Up Password');
    expect(rendered.text).toContain('24 hours');
    expect(rendered.text).toContain('Security notice');
    expect(rendered.text).toContain(
      'https://app.operix.test/setup-password?token=safe',
    );
    expect(rendered.text.toLowerCase()).not.toContain('bootstrap password');
  });

  it('renders Registration Received as a neutral process without a CTA', async () => {
    const rendered = await new MailTemplateRenderer().render(
      MAIL_TEMPLATE.REGISTRATION_RECEIVED,
      { recipientName: 'Applicant A' },
    );

    expect(rendered.text).toContain('Request received');
    expect(rendered.text).toContain('Administrator review');
    expect(rendered.text).toContain('If your request is approved');
    expect(rendered.text).toContain('No action is required right now.');
    expect(rendered.text).not.toContain('Set Up Password');
    expect(rendered.html).not.toContain('class="email-button"');
  });

  it('renders Registration Rejected without private reasons or a CTA', async () => {
    const rendered = await new MailTemplateRenderer().render(
      MAIL_TEMPLATE.REGISTRATION_REJECTED,
      { recipientName: 'Applicant A' },
    );

    expect(rendered.text).toContain('Request update');
    expect(rendered.text).toContain('ACCESS REQUEST UPDATE');
    expect(rendered.text).toContain('Request review complete');
    expect(rendered.text).toContain('organization administrator');
    expect(rendered.text).not.toContain('EMAIL_UNAVAILABLE');
    expect(rendered.text).not.toContain('rejection reason');
    expect(rendered.html).not.toContain('class="email-button"');
  });

  it.each([
    ['unknown template', '../../secrets', {}],
    [
      'missing context',
      MAIL_TEMPLATE.WELCOME_USER,
      {
        recipientName: '',
        accountEmail: 'admin@example.com',
        roleLabel: 'Admin',
        loginUrl: 'https://app.operix.test/login',
      },
    ],
    [
      'invalid URL',
      MAIL_TEMPLATE.PASSWORD_RESET,
      {
        recipientName: 'Admin A',
        resetUrl: 'javascript:alert(1)',
        expiryHours: 24,
      },
    ],
    [
      'invalid expiry',
      MAIL_TEMPLATE.ACCOUNT_SETUP,
      {
        recipientName: 'Applicant A',
        setupUrl: 'https://app.operix.test/setup-password?token=safe',
        expiryHours: 0,
      },
    ],
    [
      'invalid details',
      MAIL_TEMPLATE.NOTIFICATION_ALERT,
      {
        recipientName: 'Member A',
        heading: 'Heading',
        message: 'Message',
        details: [{ label: '', value: 'value' }],
        actionLabel: null,
        actionUrl: null,
      },
    ],
  ])('normalizes %s failures', async (_caseName, templateName, context) => {
    const renderer = new MailTemplateRenderer();

    try {
      await renderer.render(
        templateName as typeof MAIL_TEMPLATE.WELCOME_USER,
        context as never,
      );
      throw new Error('Expected rendering to fail.');
    } catch (error) {
      expect(getAppErrorCode(error)).toBe(
        APP_ERROR_CODE.MAIL_TEMPLATE_RENDER_FAILED,
      );
    }
  });

  it.each([
    [MAIL_TEMPLATE.REGISTRATION_RECEIVED, { recipientName: '<Applicant>' }],
    [
      MAIL_TEMPLATE.ACCOUNT_SETUP,
      {
        recipientName: '<Applicant>',
        setupUrl: 'https://app.operix.test/setup-password?token=safe',
        expiryHours: 24,
      },
    ],
    [MAIL_TEMPLATE.REGISTRATION_REJECTED, { recipientName: '<Applicant>' }],
  ])(
    'renders the registration template %s safely',
    async (template, context) => {
      const rendered = await new MailTemplateRenderer().render(
        template as typeof MAIL_TEMPLATE.ACCOUNT_SETUP,
        context as never,
      );
      expect(rendered.html).not.toContain('<Applicant>');
      expect(rendered.html).toContain('&lt;Applicant&gt;');
      expect(rendered.text).toContain('<Applicant>');
    },
  );
});

describe('MailService', () => {
  it('keeps optional Task and Welcome mail as no-ops when SMTP is disabled', async () => {
    const service = new MailService(
      createConfig() as unknown as ConfigService<
        ApplicationConfiguration,
        true
      >,
      new MailTemplateRenderer(),
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
    await expect(
      service.sendWelcomeUserEmail({
        userId: 'admin-a',
        recipientName: 'Admin A',
        accountEmail: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).resolves.toBeUndefined();
  });

  it('reports unavailable delivery for strict password reset mail', async () => {
    const service = new MailService(
      createConfig() as unknown as ConfigService<
        ApplicationConfiguration,
        true
      >,
      new MailTemplateRenderer(),
    );

    try {
      await service.sendPasswordResetEmail({
        userId: 'admin-a',
        recipientName: 'Admin A',
        email: 'admin@example.com',
        resetUrl: 'https://api.operix.test/reset-password/token',
      });
      throw new Error('Expected delivery to fail.');
    } catch (error) {
      expect(getAppErrorCode(error)).toBe(
        APP_ERROR_CODE.MAIL_DELIVERY_UNAVAILABLE,
      );
    }
  });

  it('exposes bounded timeout constants for SMTP transport creation', () => {
    expect(SMTP_TIMEOUT_MS).toEqual({
      CONNECTION: 10_000,
      GREETING: 10_000,
      SOCKET: 10_000,
    });
  });

  it('sends rendered HTML and text through an enabled transporter', async () => {
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
      new MailTemplateRenderer(),
    );
    const serviceInternals = service as unknown as {
      transporter: {
        sendMail: unknown;
      };
    };
    const sentMessages: unknown[] = [];
    const sendMail = jestApi.fn((message: unknown) => {
      sentMessages.push(message);
      return Promise.resolve({});
    });
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

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sentMessages[0] as
      | {
          to?: { name?: string; address?: string };
          subject?: string;
          html?: unknown;
          text?: unknown;
        }
      | undefined;
    expect(message?.to).toEqual({
      name: 'Member A',
      address: 'member@example.com',
    });
    expect(message?.subject).toBe(
      'New Operix task assigned: TASK-20260821-ABC123',
    );
    expect(typeof message?.html).toBe('string');
    expect(typeof message?.text).toBe('string');
  });

  it('normalizes Nodemailer failures', async () => {
    const service = new MailService(
      createConfig({
        enabled: true,
        host: 'smtp.example.com',
        port: 587,
        user: 'user',
        pass: 'pass',
        fromEmail: 'noreply@example.com',
      }) as unknown as ConfigService<ApplicationConfiguration, true>,
      new MailTemplateRenderer(),
    );
    const serviceInternals = service as unknown as {
      transporter: { sendMail: unknown };
    };
    serviceInternals.transporter.sendMail = jestApi
      .fn()
      .mockRejectedValue(new Error('recipient@example.com refused'));

    try {
      await service.sendPasswordResetEmail({
        userId: 'admin-a',
        recipientName: 'Admin A',
        email: 'admin@example.com',
        resetUrl: 'https://api.operix.test/reset-password/token',
      });
      throw new Error('Expected delivery to fail.');
    } catch (error) {
      expect(getAppErrorCode(error)).toBe(APP_ERROR_CODE.MAIL_DELIVERY_FAILED);
    }
  });
});
