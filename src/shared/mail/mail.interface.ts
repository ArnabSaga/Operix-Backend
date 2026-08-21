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
