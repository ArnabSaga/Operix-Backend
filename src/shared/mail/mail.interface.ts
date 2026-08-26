export interface TaskAssignedEmailInput {
  memberId: string;
  memberName: string;
  memberEmail: string;
  taskId: string;
  referenceCode: string;
  title: string;
  priority: string;
  dueAt: Date | null;
  assignmentNote: string | null;
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
