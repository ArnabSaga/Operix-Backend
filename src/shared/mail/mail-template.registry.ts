import {
  MAIL_TEMPLATE,
  type MailTemplateName,
} from './mail-template.constant.js';

export interface MailTemplateRegistryEntry {
  file: string;
  documentTitle: string;
  preheaderText: string;
  requiredFields: readonly string[];
}

export const MAIL_TEMPLATE_REGISTRY = {
  [MAIL_TEMPLATE.WELCOME_USER]: {
    file: 'welcome-user.ejs',
    documentTitle: 'Welcome to Operix',
    preheaderText: 'Your Operix account is ready.',
    requiredFields: ['recipientName', 'accountEmail', 'roleLabel', 'loginUrl'],
  },
  [MAIL_TEMPLATE.NOTIFICATION_ALERT]: {
    file: 'notification-alert.ejs',
    documentTitle: 'Operix update',
    preheaderText: 'You have a new update waiting in Operix.',
    requiredFields: ['recipientName', 'heading', 'message', 'details'],
  },
  [MAIL_TEMPLATE.PASSWORD_RESET]: {
    file: 'password-reset.ejs',
    documentTitle: 'Reset your Operix password',
    preheaderText: 'Use this secure link to reset your Operix password.',
    requiredFields: ['recipientName', 'resetUrl', 'expiryHours'],
  },
  [MAIL_TEMPLATE.REGISTRATION_RECEIVED]: {
    file: 'registration-received.ejs',
    documentTitle: 'Operix access request received',
    preheaderText: 'We received your Operix access request.',
    requiredFields: ['recipientName'],
  },
  [MAIL_TEMPLATE.ACCOUNT_SETUP]: {
    file: 'account-setup.ejs',
    documentTitle: 'Set up your Operix account',
    preheaderText:
      'Your Operix access has been approved. Set up your password to continue.',
    requiredFields: ['recipientName', 'setupUrl', 'expiryHours'],
  },
  [MAIL_TEMPLATE.REGISTRATION_REJECTED]: {
    file: 'registration-rejected.ejs',
    documentTitle: 'Operix access request update',
    preheaderText: 'There is an update about your Operix access request.',
    requiredFields: ['recipientName'],
  },
} as const satisfies Record<MailTemplateName, MailTemplateRegistryEntry>;

export function isMailTemplateName(value: string): value is MailTemplateName {
  return Object.hasOwn(MAIL_TEMPLATE_REGISTRY, value);
}
