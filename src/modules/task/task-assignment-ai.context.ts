import type {
  TaskAssignmentAiCandidate,
  TaskAssignmentAiContext,
} from './task-assignment-ai.interface.js';

export function buildTaskAssignmentAiContext(input: {
  task: TaskAssignmentAiContext['task'];
  candidates: TaskAssignmentAiCandidate[];
}): TaskAssignmentAiContext {
  return {
    task: input.task,
    candidates: input.candidates.map((candidate) => ({
      candidateRef: candidate.candidateRef,
      teamName: candidate.teamName,
      designation: candidate.designation,
      metrics: candidate.metrics,
    })),
  };
}
