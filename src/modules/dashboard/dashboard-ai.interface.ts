import type { UserRole } from '../../../generated/prisma/enums.js';
import type {
  DashboardAiCategory,
  DashboardAiConfidence,
  DashboardAiPeriod,
  DashboardAiSeverity,
  DashboardAiSubjectType,
} from './dashboard-ai.constant.js';

export interface DashboardAiPriority {
  severity: DashboardAiSeverity;
  category: DashboardAiCategory;
  title: string;
  evidence: string;
  suggestedAction: string;
}

export interface DashboardAiWorkloadObservation {
  subjectType: DashboardAiSubjectType;
  subject: string;
  observation: string;
  evidence: string;
}

export interface DashboardAiBrief {
  headline: string;
  executiveSummary: string;
  priorities: DashboardAiPriority[];
  workloadObservations: DashboardAiWorkloadObservation[];
  trendSummary: string;
  reportingSummary: string | null;
  nextActions: string[];
  confidence: DashboardAiConfidence;
  limitations: string[];
}

export interface DashboardAiSnapshot {
  period: DashboardAiPeriod;
  periodStart: string;
  asOf: string;
  activeTasks: number;
  overdueTasks: number;
  reviewQueueTasks: number;
  revisionRequiredTasks: number;
  completedInPeriod: number;
}

export interface DashboardAiBriefResponse {
  snapshot: DashboardAiSnapshot;
  brief: DashboardAiBrief;
  meta: {
    provider: string;
    model: string;
    attempts: number;
    latencyMs: number;
    period: DashboardAiPeriod;
    days: number;
    asOf: string;
  };
}

export interface DashboardAiTeamContext {
  name: string;
  activeMembers: number;
  activeTasks: number;
  overdueTasks: number;
  reviewQueueTasks: number;
  revisionRequiredTasks: number;
}

export interface DashboardAiMemberContext {
  name: string;
  teamName: string | null;
  activeTasks: number;
  overdueTasks: number;
  statusCounts: Record<string, number>;
  activePriorityCounts: Record<string, number>;
}

export type DashboardManagementReportScope = 'CURRENT_MONTH' | 'CURRENT_STATE';

/**
 * Period label carried into the AI prompt.
 *
 * Ask Operix answers 90-day operations questions, which is a supported trend
 * window but not an Operations Brief period. Widening only the prompt-side type
 * keeps the public brief contract (`DashboardAiPeriod`) unchanged.
 */
export type DashboardAiContextPeriod = DashboardAiPeriod | 'LAST_90_DAYS';

export interface DashboardAiContext {
  role: Extract<UserRole, 'SUPER_ADMIN' | 'ADMIN'>;
  asOf: string;
  period: DashboardAiContextPeriod;
  trendDays: number;
  kpis: Record<string, number | null>;
  taskStatusCounts: Record<string, number>;
  managementReports: {
    statusCounts: Record<string, number>;
    scope: DashboardManagementReportScope;
  };
  teams: DashboardAiTeamContext[];
  teamSummary: {
    activeTasks: number;
    overdueTasks: number;
    reviewQueueTasks: number;
    revisionRequiredTasks: number;
    statusCounts: Record<string, number>;
  } | null;
  members: DashboardAiMemberContext[];
  completionTrend: {
    points: { date: string; completedTasks: number }[];
    completedInWindow: number;
    /** Number of trailing days the "recent" comparison actually covers. */
    recentWindowDays: number;
    recentWindowCompleted: number;
    /** Null when the window is too short for a prior comparison period. */
    priorWindowDays: number | null;
    priorWindowCompleted: number | null;
    peakDay: { date: string; completedTasks: number } | null;
    zeroCompletionDays: number;
  };
  recentActivity: {
    action: string;
    entityType: string;
    actorName: string | null;
    createdAt: string;
  }[];
}

export interface DashboardAiContextBuildResult {
  context: DashboardAiContext;
  limitations: string[];
}

export type DashboardAiValidationFailureReason =
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_headline'
  | 'invalid_summary'
  | 'invalid_priorities'
  | 'invalid_observations'
  | 'invalid_trend_summary'
  | 'invalid_reporting_summary'
  | 'invalid_next_actions'
  | 'invalid_confidence'
  | 'invalid_limitations';

export type DashboardAiValidationResult =
  | { ok: true; brief: DashboardAiBrief }
  | { ok: false; reason: DashboardAiValidationFailureReason };
