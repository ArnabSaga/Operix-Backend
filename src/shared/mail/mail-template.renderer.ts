import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import ejs, { type TemplateFunction } from 'ejs';
import { convert } from 'html-to-text';
import juice from 'juice';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { APP_ERROR_CODE } from '../errors/app-error-code.constant.js';
import { AppException } from '../errors/app.exception.js';
import {
  MAIL_TEMPLATE,
  type MailTemplateName,
} from './mail-template.constant.js';
import type {
  MailTemplateContext,
  NotificationAlertEmailContext,
  PasswordResetEmailContext,
  RenderedMailTemplate,
  WelcomeUserEmailContext,
} from './mail-template.interface.js';
import {
  isMailTemplateName,
  MAIL_TEMPLATE_REGISTRY,
} from './mail-template.registry.js';

const LAYOUT_PATH = fileURLToPath(
  new URL('./templates/layouts/base.ejs', import.meta.url),
);
const CSS_PATH = fileURLToPath(
  new URL('./templates/styles/base.css', import.meta.url),
);

@Injectable()
export class MailTemplateRenderer {
  private readonly logger = new Logger(MailTemplateRenderer.name);
  private readonly bodyTemplates = new Map<
    MailTemplateName,
    TemplateFunction
  >();
  private layoutTemplate: TemplateFunction | null = null;
  private baseCss: string | null = null;

  async render<TName extends MailTemplateName>(
    templateName: TName,
    context: MailTemplateContext<TName>,
  ): Promise<RenderedMailTemplate> {
    try {
      this.validate(templateName, context);

      const [bodyTemplate, layoutTemplate, css] = await Promise.all([
        this.loadBodyTemplate(templateName),
        this.loadLayoutTemplate(),
        this.loadCss(),
      ]);
      const bodyHtml = bodyTemplate(context);
      const documentHtml = layoutTemplate({
        bodyHtml,
        css,
        documentTitle: 'Operix',
      });
      const html = juice(documentHtml);
      const text = convert(html, {
        wordwrap: 100,
      });

      return { html, text };
    } catch (error) {
      this.logger.error('Mail template rendering failed.', {
        templateName: String(templateName),
        errorName: getErrorName(error),
      });
      if (
        error instanceof AppException &&
        this.isTemplateRenderException(error)
      ) {
        throw error;
      }

      throw templateRenderException();
    }
  }

  private async loadBodyTemplate(
    templateName: MailTemplateName,
  ): Promise<TemplateFunction> {
    const cached = this.bodyTemplates.get(templateName);
    if (cached) {
      return cached;
    }

    const entry = MAIL_TEMPLATE_REGISTRY[templateName];
    const filename = fileURLToPath(
      new URL(`./templates/${entry.file}`, import.meta.url),
    );
    const source = await readFile(filename, 'utf8');
    const compiled = ejs.compile(source, {
      filename,
    });
    this.bodyTemplates.set(templateName, compiled);
    return compiled;
  }

  private async loadLayoutTemplate(): Promise<TemplateFunction> {
    if (this.layoutTemplate) {
      return this.layoutTemplate;
    }

    const source = await readFile(LAYOUT_PATH, 'utf8');
    this.layoutTemplate = ejs.compile(source, {
      filename: LAYOUT_PATH,
    });
    return this.layoutTemplate;
  }

  private async loadCss(): Promise<string> {
    if (this.baseCss !== null) {
      return this.baseCss;
    }

    this.baseCss = await readFile(CSS_PATH, 'utf8');
    return this.baseCss;
  }

  private validate<TName extends MailTemplateName>(
    templateName: TName,
    context: MailTemplateContext<TName>,
  ): void {
    if (!isMailTemplateName(templateName)) {
      throw templateRenderException();
    }

    const values = context as unknown as Record<string, unknown>;
    for (const field of MAIL_TEMPLATE_REGISTRY[templateName].requiredFields) {
      const value = values[field];
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim().length === 0)
      ) {
        throw templateRenderException();
      }
    }

    if (templateName === MAIL_TEMPLATE.WELCOME_USER) {
      const welcome = context as WelcomeUserEmailContext;
      assertEmail(welcome.accountEmail);
      assertHttpUrl(welcome.loginUrl);
    }

    if (templateName === MAIL_TEMPLATE.NOTIFICATION_ALERT) {
      validateNotificationContext(context as NotificationAlertEmailContext);
    }

    if (templateName === MAIL_TEMPLATE.PASSWORD_RESET) {
      assertHttpUrl((context as PasswordResetEmailContext).resetUrl);
    }

    if (templateName === MAIL_TEMPLATE.ACCOUNT_SETUP) {
      assertHttpUrl((context as { setupUrl: string }).setupUrl);
    }
  }

  private isTemplateRenderException(error: AppException): boolean {
    const response = error.getResponse();
    return (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      response.code === APP_ERROR_CODE.MAIL_TEMPLATE_RENDER_FAILED
    );
  }
}

function validateNotificationContext(
  context: NotificationAlertEmailContext,
): void {
  if (!Array.isArray(context.details)) {
    throw templateRenderException();
  }

  for (const detail of context.details) {
    if (
      typeof detail !== 'object' ||
      detail === null ||
      !isNonEmptyString(detail.label) ||
      !isNonEmptyString(detail.value)
    ) {
      throw templateRenderException();
    }
  }

  if (context.actionLabel === null && context.actionUrl === null) {
    return;
  }

  if (
    !isNonEmptyString(context.actionLabel) ||
    !isNonEmptyString(context.actionUrl)
  ) {
    throw templateRenderException();
  }

  assertHttpUrl(context.actionUrl);
}

function assertHttpUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported URL protocol.');
    }
  } catch {
    throw templateRenderException();
  }
}

function assertEmail(value: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw templateRenderException();
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function templateRenderException(): AppException {
  return new AppException(
    HttpStatus.INTERNAL_SERVER_ERROR,
    APP_ERROR_CODE.MAIL_TEMPLATE_RENDER_FAILED,
    'Mail template rendering failed.',
  );
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
