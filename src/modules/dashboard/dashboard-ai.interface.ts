import type { UserRole } from '../../../generated/prisma/enums.js';
import type { DashboardTrendDays } from './dashboard.constant.js';

export const DASHBOARD_AI_SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type DashboardAiSeverity = (typeof DASHBOARD_AI_SEVERITIES)[number];

export const DASHBOARD_AI_CATEGORIES = [
  'OVERDUE',
  'REVIEW_QUEUE',
  'REVISION',
  'WORKLOAD',
  'COMPLETION_TREND',
  'MANAGEMENT_REPORTS',
  'ACTIVITY',
] as const;
export type DashboardAiCategory = (typeof DASHBOARD_AI_CATEGORIES)[number];

export const DASHBOARD_AI_SUBJECT_TYPES = ['TEAM', 'MEMBER'] as const;
export type DashboardAiSubjectType =
  (typeof DASHBOARD_AI_SUBJECT_TYPES)[number];

export const DASHBOARD_AI_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type DashboardAiConfidence = (typeof DASHBOARD_AI_CONFIDENCE)[number];

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

export interface DashboardAiBriefResponse extends DashboardAiBrief {
  meta: {
    provider: string;
    model: string;
    attempts: number;
    latencyMs: number;
    days: DashboardTrendDays;
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

export interface DashboardAiContext {
  role: Extract<UserRole, 'SUPER_ADMIN' | 'ADMIN'>;
  asOf: string;
  trendDays: DashboardTrendDays;
  kpis: Record<string, number | null>;
  taskStatusCounts: Record<string, number>;
  managementReports: {
    statusCounts: Record<string, number>;
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
    recent7DayCompleted: number;
    previous7DayCompleted: number | null;
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
