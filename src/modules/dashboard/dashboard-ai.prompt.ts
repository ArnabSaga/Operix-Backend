import type { DashboardAiContext } from './dashboard-ai.interface.js';

export function buildDashboardAiPrompt(context: DashboardAiContext): string {
  return [
    'Current authorized Operix Dashboard snapshot:',
    '```json',
    JSON.stringify(context, null, 2).replace(/```/g, "'''"),
    '```',
    '',
    'Produce the concise advisory operations brief required by the response schema.',
  ].join('\n');
}
