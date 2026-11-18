import type {
  TaskCompletionMode,
  TaskPriority,
  TaskScope,
} from '../../../generated/prisma/enums.js';

export type TaskAssignmentAiDecision = 'RECOMMEND' | 'MANUAL_SELECTION';
export type TaskAssignmentAiConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TaskAssignmentCandidateMetrics {
  activeTasks: number;
  overdueTasks: number;
  activeUrgentTasks: number;
  activeHighTasks: number;
  completionRate: number | null;
  onTimeRate: number | null;
  averageCompletionMinutes: number | null;
  completedTasks: number;
  completedWithDeadline: number;
  relevantCategoryCompletedTasks: number | null;
  relevantCategoryOnTimeTasks: number | null;
}

export type TaskAssignmentRecommendationMetrics = Omit<
  TaskAssignmentCandidateMetrics,
  'completedTasks' | 'completedWithDeadline'
>;

export interface TaskAssignmentAiCandidate {
  candidateRef: string;
  privateId: string;
  publicId: string;
  name: string;
  designation: string | null;
  teamName: string | null;
  metrics: TaskAssignmentCandidateMetrics;
}

export interface TaskAssignmentAiContext {
  task: {
    title: string;
    description: string | null;
    remarks: string | null;
    priority: TaskPriority;
    dueAt: string | null;
    completionMode: TaskCompletionMode;
    scope: TaskScope;
    teamName: string | null;
    categoryName: string | null;
  };
  candidates: {
    candidateRef: string;
    teamName: string | null;
    designation: string | null;
    metrics: TaskAssignmentCandidateMetrics;
  }[];
}

export interface TaskAssignmentAiRecommendationDraft {
  candidateRef: string;
  rationale: string;
  strengths: string[];
  cautions: string[];
}

export interface TaskAssignmentAiDraft {
  summary: string;
  decision: TaskAssignmentAiDecision;
  recommendations: TaskAssignmentAiRecommendationDraft[];
  confidence: TaskAssignmentAiConfidence;
  limitations: string[];
}

export interface TaskAssignmentAiResponse {
  taskId: string;
  asOf: string;
  decision: TaskAssignmentAiDecision;
  summary: string;
  recommendations: {
    rank: number;
    member: {
      id: string;
      name: string;
      designation: string | null;
      teamName: string | null;
    };
    metrics: TaskAssignmentRecommendationMetrics;
    rationale: string;
    strengths: string[];
    cautions: string[];
  }[];
  confidence: TaskAssignmentAiConfidence;
  limitations: string[];
  meta: {
    provider: string;
    model: string;
    attempts: number;
    latencyMs: number;
    eligibleCandidates: number;
    consideredCandidates: number;
  };
}

export type TaskAssignmentAiValidationFailureReason =
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_summary'
  | 'invalid_decision'
  | 'invalid_recommendations'
  | 'invalid_candidate_ref'
  | 'invalid_confidence'
  | 'invalid_limitations';

export type TaskAssignmentAiValidationResult =
  | { ok: true; draft: TaskAssignmentAiDraft }
  | { ok: false; reason: TaskAssignmentAiValidationFailureReason };
