import type { TaskAssignedEmailInput } from './mail.interface.js';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderTaskAssignedEmail(
  input: TaskAssignedEmailInput,
  frontendAppUrl: string,
): RenderedEmail {
  const taskUrl = new URL(
    `/tasks/${encodeURIComponent(input.taskId)}`,
    frontendAppUrl,
  ).toString();
  const dueAt = input.dueAt?.toISOString() ?? 'No deadline set';
  const note = input.assignmentNote?.trim();
  const noteText = note ? `\nAssignment note: ${note}` : '';
  const subject = `New Operix task assigned: ${input.referenceCode}`;

  const text = [
    `Hello ${input.memberName},`,
    '',
    'A new task has been assigned to you in Operix.',
    '',
    `Reference: ${input.referenceCode}`,
    `Title: ${input.title}`,
    `Priority: ${input.priority}`,
    `Due: ${dueAt}${noteText}`,
    '',
    `Open task: ${taskUrl}`,
  ].join('\n');

  const htmlNote = note
    ? `<p><strong>Assignment note:</strong> ${escapeHtml(note)}</p>`
    : '';

  const html = [
    `<p>Hello ${escapeHtml(input.memberName)},</p>`,
    '<p>A new task has been assigned to you in Operix.</p>',
    '<ul>',
    `<li><strong>Reference:</strong> ${escapeHtml(input.referenceCode)}</li>`,
    `<li><strong>Title:</strong> ${escapeHtml(input.title)}</li>`,
    `<li><strong>Priority:</strong> ${escapeHtml(input.priority)}</li>`,
    `<li><strong>Due:</strong> ${escapeHtml(dueAt)}</li>`,
    '</ul>',
    htmlNote,
    `<p><a href="${escapeHtml(taskUrl)}">Open this task in Operix</a></p>`,
  ].join('');

  return {
    subject,
    text,
    html,
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
