import {
  MAIL_TEMPLATE,
  type MailTemplateName,
} from './mail-template.constant.js';

export interface MailTemplateRegistryEntry {
  file: string;
  requiredFields: readonly string[];
}

export const MAIL_TEMPLATE_REGISTRY = {
  [MAIL_TEMPLATE.WELCOME_USER]: {
    file: 'welcome-user.ejs',
    requiredFields: ['recipientName', 'accountEmail', 'roleLabel', 'loginUrl'],
  },
  [MAIL_TEMPLATE.NOTIFICATION_ALERT]: {
    file: 'notification-alert.ejs',
    requiredFields: ['recipientName', 'heading', 'message', 'details'],
  },
  [MAIL_TEMPLATE.PASSWORD_RESET]: {
    file: 'password-reset.ejs',
    requiredFields: ['recipientName', 'resetUrl'],
  },
} as const satisfies Record<MailTemplateName, MailTemplateRegistryEntry>;

export function isMailTemplateName(value: string): value is MailTemplateName {
  return Object.hasOwn(MAIL_TEMPLATE_REGISTRY, value);
}
