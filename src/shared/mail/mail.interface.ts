/**
 * Outcome of an onboarding mail dispatch.
 *
 * `ACCEPTED` means the configured SMTP server accepted the message. It is not
 * proof that the recipient inbox received it.
 */
export type MailOutcome = 'ACCEPTED' | 'FAILED';

export interface TaskAssignedEmailInput {
  responsibleUserId: string;
  responsibleName: string;
  responsibleEmail: string;
  taskId: string;
  referenceCode: string;
  title: string;
  priority: string;
  dueAt: Date | null;
  assignmentNote: string | null;
}

export interface TaskReminderEmailInput {
  responsibleUserId: string;
  responsibleName: string;
  responsibleEmail: string;
  taskId: string;
  referenceCode: string;
  title: string;
  dueAt: Date | null;
}

export interface WelcomeUserEmailInput {
  userId: string;
  recipientName: string;
  accountEmail: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface PasswordResetEmailInput {
  userId: string;
  recipientName: string;
  email: string;
  resetUrl: string;
}

export interface RegistrationMailInput {
  requestId: string;
  recipientName: string;
  email: string;
}

export interface AccountSetupEmailInput {
  userId: string;
  recipientName: string;
  email: string;
  setupUrl: string;
}
