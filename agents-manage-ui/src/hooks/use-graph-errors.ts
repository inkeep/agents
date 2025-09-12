/**
 * Hook for accessing graph error state and utilities
 */

import { useCallback } from 'react';
import { useGraphStore } from '@/features/graph/state/use-graph-store';

export interface ErrorHelpers {
  hasFieldError: (fieldName: string) => boolean;
  getFieldErrorMessage: (fieldName: string) => string | undefined;
  getFirstErrorField: () => string | undefined;
}

export function useGraphErrors() {
  const errors = useGraphStore((state) => state.errors);
  const showErrors = useGraphStore((state) => state.showErrors);
  const hasErrors = useGraphStore((state) => state.hasErrors);
  const getNodeErrors = useGraphStore((state) => state.getNodeErrors);
  const getEdgeErrors = useGraphStore((state) => state.getEdgeErrors);
  const setErrors = useGraphStore((state) => state.setErrors);
  const clearErrors = useGraphStore((state) => state.clearErrors);
  const setShowErrors = useGraphStore((state) => state.setShowErrors);

  const getNodeErrorCount = (nodeId: string): number => {
    return getNodeErrors(nodeId).length;
  };

  const getEdgeErrorCount = (edgeId: string): number => {
    return getEdgeErrors(edgeId).length;
  };

  const hasNodeErrors = (nodeId: string): boolean => {
    return getNodeErrorCount(nodeId) > 0;
  };

  const hasEdgeErrors = (edgeId: string): boolean => {
    return getEdgeErrorCount(edgeId) > 0;
  };

  const getFieldErrors = useCallback(
    (nodeId: string): Record<string, string[]> => {
      const nodeErrors = getNodeErrors(nodeId);
      const fieldErrors: Record<string, string[]> = {};

      for (const error of nodeErrors) {
        if (!fieldErrors[error.field]) {
          fieldErrors[error.field] = [];
        }
        fieldErrors[error.field].push(error.message);
      }

      return fieldErrors;
    },
    [getNodeErrors]
  );

  const hasFieldError = useCallback(
    (nodeId: string, fieldName: string): boolean => {
      const fieldErrors = getFieldErrors(nodeId);
      return fieldName in fieldErrors;
    },
    [getFieldErrors]
  );

  const getFieldErrorMessage = useCallback(
    (nodeId: string, fieldName: string): string | undefined => {
      const fieldErrors = getFieldErrors(nodeId);
      return fieldErrors[fieldName]?.[0];
    },
    [getFieldErrors]
  );

  const getFirstErrorField = useCallback(
    (nodeId: string): string | undefined => {
      const nodeErrors = getNodeErrors(nodeId);
      return nodeErrors[0]?.field;
    },
    [getNodeErrors]
  );

  return {
    errors,
    showErrors,
    hasErrors: hasErrors(),
    getNodeErrors,
    getEdgeErrors,
    getNodeErrorCount,
    getEdgeErrorCount,
    hasNodeErrors,
    hasEdgeErrors,
    getFieldErrors,
    hasFieldError,
    getFieldErrorMessage,
    getFirstErrorField,
    setErrors,
    clearErrors,
    setShowErrors,
  };
}
