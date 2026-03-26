export type Side = 'ours' | 'theirs';

export interface ConflictResolutionState {
  rowDefaultPick: Side;
  columnOverrides: Record<string, Side>;
}

export interface MergeState {
  phase: 'resolving' | 'summary' | 'confirmed' | 'cancelled';
  currentConflictIndex: number;
  focusedColumnIndex: number;
  resolutions: ConflictResolutionState[];
}

export type MergeAction =
  | { type: 'SET_ROW_DEFAULT'; side: Side }
  | { type: 'SET_COLUMN_PICK'; column: string; side: Side }
  | { type: 'FOCUS_UP' }
  | { type: 'FOCUS_DOWN' }
  | { type: 'NEXT_CONFLICT'; totalConflicts: number }
  | { type: 'PREV_CONFLICT' }
  | { type: 'GO_BACK_TO_RESOLVING'; lastConflictIndex: number }
  | { type: 'CONFIRM' }
  | { type: 'CANCEL' };
