import type { DocumentTextFormat } from '../../shared/document-text/document-text.interface.js';

export type DocumentAiConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DocumentAiActionItem {
  action: string;
  ownerMentioned: string | null;
  dueDateMentioned: string | null;
}

export interface DocumentAiImportantDate {
  dateText: string;
  context: string;
}

export interface DocumentAiAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: DocumentAiActionItem[];
  importantDates: DocumentAiImportantDate[];
  risksOrWarnings: string[];
  confidence: DocumentAiConfidence;
}

export interface DocumentAiMeta {
  provider: string;
  model: string;
  attempts: number;
  latencyMs: number;
}

/**
 * Advisory analysis of one authorised Document.
 *
 * Nothing here changes the Document, its source Task or Submission, or any
 * workflow state. It is a read-only interpretation of extracted text.
 */
export interface DocumentAiResponse extends DocumentAiAnalysis {
  documentId: string;
  limitations: string[];
  meta: DocumentAiMeta;
}

export interface DocumentAiPromptInput {
  documentName: string;
  format: DocumentTextFormat;
  text: string;
}

export type DocumentAiValidationFailureReason =
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_summary'
  | 'invalid_key_points'
  | 'invalid_action_items'
  | 'invalid_important_dates'
  | 'invalid_risks'
  | 'invalid_confidence';

export type DocumentAiValidationResult =
  | { ok: true; analysis: DocumentAiAnalysis }
  | { ok: false; reason: DocumentAiValidationFailureReason };
