import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ApplicationConfiguration } from '../../config/configuration.js';
import { SMTP_TIMEOUT_MS } from './mail.constant.js';
import type { TaskAssignedEmailInput } from './mail.interface.js';
import { renderTaskAssignedEmail } from './task-assigned-email.template.js';

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

  async sendTaskAssignedEmail(input: TaskAssignedEmailInput): Promise<void> {
    if (!this.transporter) {
      return;
    }

    const rendered = renderTaskAssignedEmail(input, this.frontendAppUrl);

    await this.transporter.sendMail({
      from: {
        name: this.fromName,
        address: this.fromEmail,
      },
      to: {
        name: input.memberName,
        address: input.memberEmail,
      },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    this.logger.log(
      `TASK_ASSIGNED email sent for task ${input.taskId} to member ${input.memberId}`,
    );
  }
}
