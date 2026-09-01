export const MAIL_TEMPLATE = {
  WELCOME_USER: 'welcome-user',
  NOTIFICATION_ALERT: 'notification-alert',
  PASSWORD_RESET: 'password-reset',
  REGISTRATION_RECEIVED: 'registration-received',
  ACCOUNT_SETUP: 'account-setup',
  REGISTRATION_REJECTED: 'registration-rejected',
} as const;

export type MailTemplateName =
  (typeof MAIL_TEMPLATE)[keyof typeof MAIL_TEMPLATE];
