import type { SafeTaskResponse } from '../task/task.interface.js';
import type { AskOperixTaskFact } from './assistant.interface.js';

export function buildAskOperixTaskContext(tasks: SafeTaskResponse[]): {
  facts: AskOperixTaskFact[];
  tasksByRef: Map<string, SafeTaskResponse>;
} {
  const tasksByRef = new Map<string, SafeTaskResponse>();
  const facts = tasks.map((task, index) => {
    const taskRef = `T${String(index + 1).padStart(2, '0')}`;
    tasksByRef.set(taskRef, task);
    return {
      taskRef,
      referenceCode: task.referenceCode,
      title: task.title,
      status: task.status,
      priority: task.priority,
      scope: task.scope,
      dueAt: task.dueAt?.toISOString() ?? null,
      teamName: task.team?.name ?? null,
      responsibleName: task.responsible?.name ?? null,
    };
  });
  return { facts, tasksByRef };
}
