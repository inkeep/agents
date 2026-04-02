import type { ConflictItem, ConflictResolution } from '@inkeep/agents-core';
import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useReducer } from 'react';
import { ConflictView } from './conflict-view';
import { HelpBar } from './help-bar';
import { ResolutionSummary } from './resolution-summary';
import type { ConflictResolutionState, MergeAction, MergeState, Side } from './types';
import { diffTypeColor, formatDiffType, formatEntityId, getChangedColumns } from './utils';

function createInitialState(conflicts: ConflictItem[]): MergeState {
  return {
    phase: 'resolving',
    currentConflictIndex: 0,
    focusedColumnIndex: -1,
    resolutions: conflicts.map(
      (): ConflictResolutionState => ({
        rowDefaultPick: 'ours',
        columnOverrides: {},
      })
    ),
  };
}

function mergeReducer(state: MergeState, action: MergeAction): MergeState {
  switch (action.type) {
    case 'SET_ROW_DEFAULT': {
      const resolutions = [...state.resolutions];
      resolutions[state.currentConflictIndex] = {
        rowDefaultPick: action.side,
        columnOverrides: {},
      };
      return { ...state, resolutions };
    }
    case 'SET_COLUMN_PICK': {
      const resolutions = [...state.resolutions];
      const current = resolutions[state.currentConflictIndex];
      resolutions[state.currentConflictIndex] = {
        ...current,
        columnOverrides: {
          ...current.columnOverrides,
          [action.column]: action.side,
        },
      };
      return { ...state, resolutions };
    }
    case 'FOCUS_UP':
      return { ...state, focusedColumnIndex: state.focusedColumnIndex - 1 };
    case 'FOCUS_DOWN':
      return { ...state, focusedColumnIndex: state.focusedColumnIndex + 1 };
    case 'NEXT_CONFLICT': {
      const nextIndex = state.currentConflictIndex + 1;
      if (nextIndex >= action.totalConflicts) {
        return { ...state, phase: 'summary' };
      }
      return { ...state, currentConflictIndex: nextIndex, focusedColumnIndex: -1 };
    }
    case 'PREV_CONFLICT': {
      if (state.currentConflictIndex <= 0) return state;
      return {
        ...state,
        currentConflictIndex: state.currentConflictIndex - 1,
        focusedColumnIndex: -1,
      };
    }
    case 'GO_BACK_TO_RESOLVING':
      return {
        ...state,
        phase: 'resolving',
        currentConflictIndex: action.lastConflictIndex,
        focusedColumnIndex: -1,
      };
    case 'CONFIRM':
      return { ...state, phase: 'confirmed' };
    case 'CANCEL':
      return { ...state, phase: 'cancelled' };
  }
}

function buildResolutions(
  conflicts: ConflictItem[],
  resolutions: ConflictResolutionState[],
  allChangedColumns: string[][]
): ConflictResolution[] {
  return conflicts.map((conflict, i) => {
    const res = resolutions[i];
    const changedCols = allChangedColumns[i];
    const columns: Record<string, Side> = {};
    for (const col of changedCols) {
      columns[col] = res.columnOverrides[col] ?? res.rowDefaultPick;
    }
    return {
      table: conflict.table,
      primaryKey: conflict.primaryKey,
      rowDefaultPick: res.rowDefaultPick,
      columns,
    };
  });
}

interface MergeAppProps {
  conflicts: ConflictItem[];
}

export function MergeApp({ conflicts }: MergeAppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(mergeReducer, conflicts, createInitialState);
  const isEmpty = conflicts.length === 0;

  const allChangedColumns = conflicts.map(getChangedColumns);

  const currentConflict = isEmpty ? undefined : conflicts[state.currentConflictIndex];
  const isRowLevelOnly = currentConflict?.ours === null || currentConflict?.theirs === null;
  const currentChangedColumns = allChangedColumns[state.currentConflictIndex] ?? [];
  const maxColumnIndex = currentChangedColumns.length - 1;

  useEffect(() => {
    if (isEmpty) {
      exit([]);
      return;
    }
    if (state.phase === 'confirmed') {
      exit(buildResolutions(conflicts, state.resolutions, allChangedColumns));
    } else if (state.phase === 'cancelled') {
      exit(null);
    }
  }, [isEmpty, state.phase, conflicts, state.resolutions, allChangedColumns, exit]);

  useInput((input, key) => {
    if (isEmpty) return;

    if (key.escape || input === 'q') {
      dispatch({ type: 'CANCEL' });
      return;
    }

    if (state.phase === 'summary') {
      if (key.return) {
        dispatch({ type: 'CONFIRM' });
      }
      if (input === 'b' || input === 'p') {
        dispatch({ type: 'GO_BACK_TO_RESOLVING', lastConflictIndex: conflicts.length - 1 });
      }
      return;
    }

    if (state.phase !== 'resolving') return;

    if (!isRowLevelOnly) {
      if (key.upArrow || input === 'k') {
        if (state.focusedColumnIndex > -1) {
          dispatch({ type: 'FOCUS_UP' });
        }
      }
      if (key.downArrow || input === 'j') {
        if (state.focusedColumnIndex < maxColumnIndex) {
          dispatch({ type: 'FOCUS_DOWN' });
        }
      }
    }

    if (input === '1' || input === 'l' || key.leftArrow) {
      if (isRowLevelOnly || state.focusedColumnIndex === -1) {
        dispatch({ type: 'SET_ROW_DEFAULT', side: 'ours' });
      } else {
        dispatch({
          type: 'SET_COLUMN_PICK',
          column: currentChangedColumns[state.focusedColumnIndex],
          side: 'ours',
        });
      }
    }
    if (input === '2' || input === 'r' || key.rightArrow) {
      if (isRowLevelOnly || state.focusedColumnIndex === -1) {
        dispatch({ type: 'SET_ROW_DEFAULT', side: 'theirs' });
      } else {
        dispatch({
          type: 'SET_COLUMN_PICK',
          column: currentChangedColumns[state.focusedColumnIndex],
          side: 'theirs',
        });
      }
    }

    if (key.return || input === 'n') {
      dispatch({ type: 'NEXT_CONFLICT', totalConflicts: conflicts.length });
    }
    if (input === 'p') {
      dispatch({ type: 'PREV_CONFLICT' });
    }
  });

  if (isEmpty) return null;

  const conflictListHeader = (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow">{conflicts.length} conflict(s) found:</Text>
      {conflicts.map((c, i) => {
        const entity = formatEntityId(c.primaryKey);
        return (
          <Text key={`${c.table}-${entity}`}>
            {'  '}
            {i + 1}. <Text color="cyan">{c.table}</Text> <Text bold>{entity}</Text>
            {'  local: '}
            <Text color={diffTypeColor(c.ourDiffType)}>{formatDiffType(c.ourDiffType)}</Text>
            {' | remote: '}
            <Text color={diffTypeColor(c.theirDiffType)}>{formatDiffType(c.theirDiffType)}</Text>
          </Text>
        );
      })}
    </Box>
  );

  if (state.phase === 'summary') {
    return (
      <Box flexDirection="column">
        {conflictListHeader}
        <ResolutionSummary
          conflicts={conflicts}
          resolutions={state.resolutions}
          allChangedColumns={allChangedColumns}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {conflictListHeader}
      <ConflictView
        conflict={conflicts[state.currentConflictIndex]}
        resolution={state.resolutions[state.currentConflictIndex]}
        changedColumns={currentChangedColumns}
        focusedColumnIndex={state.focusedColumnIndex}
        conflictIndex={state.currentConflictIndex}
        totalConflicts={conflicts.length}
      />
      <HelpBar phase="resolving" />
    </Box>
  );
}
