export interface ApiErrorResponse {
  success: false;
  message: string;
  code: string;
  details: unknown;
}
