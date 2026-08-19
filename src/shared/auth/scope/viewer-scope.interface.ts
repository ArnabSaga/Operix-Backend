export type OperixViewerScope =
  | { type: 'GLOBAL' }
  | { type: 'ADMIN'; teamIds: string[] }
  | { type: 'MEMBER'; teamId: string | null };
