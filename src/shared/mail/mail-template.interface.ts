import type { MailTemplateName } from './mail-template.constant.js';

export interface MailRecipient {
  address: string;
  name?: string;
}

export interface RenderedMailTemplate {
  html: string;
  text: string;
}

export interface WelcomeUserEmailContext {
  recipientName: string;
  accountEmail: string;
  roleLabel: string;
  loginUrl: string;
}

export interface NotificationAlertDetail {
  label: string;
  value: string;
}

export interface NotificationAlertEmailContext {
  recipientName: string;
  heading: string;
  message: string;
  details: NotificationAlertDetail[];
  actionLabel: string | null;
  actionUrl: string | null;
}

export interface PasswordResetEmailContext {
  recipientName: string;
  resetUrl: string;
}

export interface MailTemplateContextMap {
  'welcome-user': WelcomeUserEmailContext;
  'notification-alert': NotificationAlertEmailContext;
  'password-reset': PasswordResetEmailContext;
}

export type MailTemplateContext<TName extends MailTemplateName> =
  MailTemplateContextMap[TName];
