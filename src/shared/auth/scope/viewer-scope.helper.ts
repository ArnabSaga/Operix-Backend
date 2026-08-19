import type { OperixViewer } from '../viewer.interface.js';

export function hasGlobalScope(viewer: OperixViewer): boolean {
  return viewer.scope.type === 'GLOBAL';
}

export function getAdminScopedTeamIds(viewer: OperixViewer): string[] {
  if (viewer.scope.type !== 'ADMIN') {
    return [];
  }

  return viewer.scope.teamIds;
}

export function getMemberScopedTeamId(viewer: OperixViewer): string | null {
  if (viewer.scope.type !== 'MEMBER') {
    return null;
  }

  return viewer.scope.teamId;
}
