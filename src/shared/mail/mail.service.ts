import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import { SMTP_TIMEOUT_MS } from './mail.constant.js';
import {
  MAIL_TEMPLATE,
  type MailTemplateName,
} from './mail-template.constant.js';
import type {
  MailRecipient,
  MailTemplateContextMap,
} from './mail-template.interface.js';
import { MailTemplateRenderer } from './mail-template.renderer.js';
import type {
  PasswordResetEmailInput,
  RegistrationMailInput,
  AccountSetupEmailInput,
  TaskAssignedEmailInput,
  WelcomeUserEmailInput,
} from './mail.interface.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly frontendAppUrl: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(
    private readonly configService: ConfigService<
      ApplicationConfiguration,
      true
    >,
    private readonly renderer: MailTemplateRenderer,
  ) {
    const smtp = this.configService.get('smtp', { infer: true });
    this.frontendAppUrl = this.configService.get('app.frontendAppUrl', {
      infer: true,
    });
    this.fromEmail = smtp.fromEmail;
    this.fromName = smtp.fromName;

    if (!smtp.enabled) {
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
      connectionTimeout: SMTP_TIMEOUT_MS.CONNECTION,
      greetingTimeout: SMTP_TIMEOUT_MS.GREETING,
      socketTimeout: SMTP_TIMEOUT_MS.SOCKET,
    });
  }

  async sendTemplatedEmail<TName extends MailTemplateName>(
    to: MailRecipient,
    subject: string,
    templateName: TName,
    context: MailTemplateContextMap[TName],
  ): Promise<void> {
    if (!this.transporter) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.MAIL_DELIVERY_UNAVAILABLE,
        'Mail delivery is unavailable.',
      );
    }

    const rendered = await this.renderer.render(templateName, context);

    try {
      await this.transporter.sendMail({
        from: {
          name: this.fromName,
          address: this.fromEmail,
        },
        to,
        subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch (error) {
      this.logger.error('Mail delivery failed.', {
        templateName,
        errorName: getErrorName(error),
      });
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.MAIL_DELIVERY_FAILED,
        'Mail delivery failed.',
      );
    }
  }

  async sendTaskAssignedEmail(input: TaskAssignedEmailInput): Promise<void> {
    if (!this.transporter) {
      return;
    }

    const taskUrl = new URL(
      `/tasks/${encodeURIComponent(input.taskId)}`,
      this.frontendAppUrl,
    ).toString();
    const details = [
      { label: 'Reference', value: input.referenceCode },
      { label: 'Task', value: input.title },
      { label: 'Priority', value: input.priority },
      {
        label: 'Due',
        value: input.dueAt?.toISOString() ?? 'No deadline set',
      },
    ];
    const note = input.assignmentNote?.trim();
    if (note) {
      details.push({ label: 'Assignment note', value: note });
    }

    await this.sendTemplatedEmail(
      {
        name: input.memberName,
        address: input.memberEmail,
      },
      `New Operix task assigned: ${input.referenceCode}`,
      MAIL_TEMPLATE.NOTIFICATION_ALERT,
      {
        recipientName: input.memberName,
        heading: 'New task assigned',
        message: 'A new task has been assigned to you in Operix.',
        details,
        actionLabel: 'Open this task in Operix',
        actionUrl: taskUrl,
      },
    );

    this.logger.log('Task assignment email sent.', {
      templateName: MAIL_TEMPLATE.NOTIFICATION_ALERT,
      eventId: input.taskId,
    });
  }

  async sendWelcomeUserEmail(input: WelcomeUserEmailInput): Promise<void> {
    if (!this.transporter) {
      return;
    }

    const loginUrl = new URL('/login', this.frontendAppUrl).toString();
    await this.sendTemplatedEmail(
      {
        name: input.recipientName,
        address: input.accountEmail,
      },
      'Welcome to Operix',
      MAIL_TEMPLATE.WELCOME_USER,
      {
        recipientName: input.recipientName,
        accountEmail: input.accountEmail,
        roleLabel: input.role === 'ADMIN' ? 'Admin' : 'Member',
        loginUrl,
      },
    );

    this.logger.log('Welcome email sent.', {
      templateName: MAIL_TEMPLATE.WELCOME_USER,
      eventId: input.userId,
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    await this.sendTemplatedEmail(
      {
        name: input.recipientName,
        address: input.email,
      },
      'Reset your Operix password',
      MAIL_TEMPLATE.PASSWORD_RESET,
      {
        recipientName: input.recipientName,
        resetUrl: input.resetUrl,
      },
    );

    this.logger.log('Password reset email sent.', {
      templateName: MAIL_TEMPLATE.PASSWORD_RESET,
      eventId: input.userId,
    });
  }

  async sendRegistrationReceivedEmail(
    input: RegistrationMailInput,
  ): Promise<void> {
    if (!this.transporter) return;
    await this.sendTemplatedEmail(
      { name: input.recipientName, address: input.email },
      'We received your Operix access request',
      MAIL_TEMPLATE.REGISTRATION_RECEIVED,
      { recipientName: input.recipientName },
    );
  }

  async sendRegistrationRejectedEmail(
    input: RegistrationMailInput,
  ): Promise<void> {
    if (!this.transporter) return;
    await this.sendTemplatedEmail(
      { name: input.recipientName, address: input.email },
      'Operix access request update',
      MAIL_TEMPLATE.REGISTRATION_REJECTED,
      { recipientName: input.recipientName },
    );
  }

  async sendAccountSetupEmail(input: AccountSetupEmailInput): Promise<void> {
    await this.sendTemplatedEmail(
      { name: input.recipientName, address: input.email },
      'Set up your Operix account',
      MAIL_TEMPLATE.ACCOUNT_SETUP,
      { recipientName: input.recipientName, setupUrl: input.setupUrl },
    );
  }

  logPasswordResetDeliveryFailure(userId: string, error: unknown): void {
    this.logger.warn('Password reset email delivery failed.', {
      templateName: MAIL_TEMPLATE.PASSWORD_RESET,
      eventId: userId,
      errorName: getErrorName(error),
      errorCode: getSafeErrorCode(error),
    });
  }
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function getSafeErrorCode(error: unknown): string {
  if (!(error instanceof AppException)) {
    return APP_ERROR_CODE.INTERNAL_SERVER_ERROR;
  }

  const response = error.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
  ) {
    return response.code;
  }

  return APP_ERROR_CODE.INTERNAL_SERVER_ERROR;
}
