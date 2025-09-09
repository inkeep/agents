'use client';

import { ArrowDown, Check, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface InheritanceIndicatorProps {
  /** Whether this value is explicitly set (not inherited) */
  isExplicit?: boolean;
  /** The source of inheritance (e.g., "Project", "Graph") */
  inheritedFrom?: string;
  /** Additional tooltip information */
  tooltip?: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Position of the indicator */
  position?: 'inline' | 'absolute';
}

export function InheritanceIndicator({
  isExplicit = false,
  inheritedFrom,
  tooltip,
  size = 'sm',
  position = 'inline',
}: InheritanceIndicatorProps) {
  if (isExplicit) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`
                ${size === 'sm' ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-sm'}
                ${position === 'absolute' ? 'absolute -top-2 -right-2' : 'inline-flex'}
                bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 
                text-green-800 dark:text-green-200 items-center gap-1
              `}
            >
              <Check className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              {size === 'md' && 'Explicit'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip || 'This value is explicitly set at this level'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (inheritedFrom) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`
                ${size === 'sm' ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-sm'}
                ${position === 'absolute' ? 'absolute -top-2 -right-2' : 'inline-flex'}
                bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 
                text-blue-800 dark:text-blue-200 items-center gap-1
              `}
            >
              <ArrowDown className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
              {size === 'md' && `From ${inheritedFrom}`}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip || `This value is inherited from ${inheritedFrom} level`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Default/fallback state
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`
              ${size === 'sm' ? 'h-5 px-1.5 text-xs' : 'h-6 px-2 text-sm'}
              ${position === 'absolute' ? 'absolute -top-2 -right-2' : 'inline-flex'}
              bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800 
              text-gray-600 dark:text-gray-400 items-center gap-1
            `}
          >
            <Info className={size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {size === 'md' && 'Default'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip || 'Using system default value'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper function to determine inheritance status for models
export function getModelInheritanceStatus(
  currentLevel: 'project' | 'graph' | 'agent',
  currentValue: any,
  parentValue: any,
  grandparentValue?: any
): {
  isExplicit: boolean;
  inheritedFrom?: string;
  tooltip?: string;
} {
  const hasCurrentValue =
    currentValue !== undefined && currentValue !== null && currentValue !== '';
  const hasParentValue = parentValue !== undefined && parentValue !== null && parentValue !== '';
  const hasGrandparentValue =
    grandparentValue !== undefined && grandparentValue !== null && grandparentValue !== '';

  // For non-project levels: if current value matches parent value exactly, it's likely inherited
  // This handles the case where the builder resolves inheritance and stores the actual values
  if (currentLevel !== 'project') {
    if (hasCurrentValue && hasParentValue && currentValue === parentValue) {
      const inheritedFromLevel = currentLevel === 'agent' ? 'Graph' : 'Project';
      return {
        isExplicit: false,
        inheritedFrom: inheritedFromLevel,
        tooltip: `This model is inherited from the ${inheritedFromLevel.toLowerCase()} level`,
      };
    }

    // For agent level: also check if it matches grandparent (when graph doesn't have it set)
    if (
      currentLevel === 'agent' &&
      hasCurrentValue &&
      !hasParentValue &&
      hasGrandparentValue &&
      currentValue === grandparentValue
    ) {
      return {
        isExplicit: false,
        inheritedFrom: 'Project',
        tooltip: 'This model is inherited from the project level',
      };
    }
  }

  // If there's a value at current level that doesn't match parent, it's explicit
  if (hasCurrentValue) {
    return {
      isExplicit: true,
      tooltip: `This model is explicitly configured at the ${currentLevel} level`,
    };
  }

  // No current value - show what would be inherited
  switch (currentLevel) {
    case 'agent':
      if (hasParentValue) {
        return {
          isExplicit: false,
          inheritedFrom: 'Graph',
          tooltip: 'Will inherit from the graph level',
        };
      }
      if (hasGrandparentValue) {
        return {
          isExplicit: false,
          inheritedFrom: 'Project',
          tooltip: 'Will inherit from the project level',
        };
      }
      break;

    case 'graph':
      if (hasParentValue) {
        return {
          isExplicit: false,
          inheritedFrom: 'Project',
          tooltip: 'Will inherit from the project level',
        };
      }
      break;

    case 'project':
      // Project level has no parent to inherit from
      break;
  }

  // No inheritance found - using defaults
  return {
    isExplicit: false,
    tooltip: 'Using system default configuration',
  };
}

// Helper function for execution limits inheritance
export function getExecutionLimitInheritanceStatus(
  currentLevel: 'project' | 'graph' | 'agent',
  limitType: 'transferCountIs' | 'stepCountIs',
  currentValue: any,
  parentValue: any
): {
  isExplicit: boolean;
  inheritedFrom?: string;
  tooltip?: string;
} {
  const hasCurrentValue = currentValue !== undefined && currentValue !== null;
  const hasParentValue = parentValue !== undefined && parentValue !== null;

  // Check if current value matches parent value (indicating inheritance after builder resolution)
  if (hasCurrentValue && hasParentValue && currentValue === parentValue) {
    // Inheritance rules for execution limits
    if (limitType === 'transferCountIs' && currentLevel === 'graph') {
      return {
        isExplicit: false,
        inheritedFrom: 'Project',
        tooltip: 'This transfer limit is inherited from the project level',
      };
    }
    if (limitType === 'stepCountIs' && currentLevel === 'agent') {
      return {
        isExplicit: false,
        inheritedFrom: 'Project',
        tooltip: 'This step limit is inherited from the project level',
      };
    }
  }

  // If there's a value at current level that doesn't match parent, it's explicit
  if (hasCurrentValue) {
    return {
      isExplicit: true,
      tooltip: `This ${limitType === 'transferCountIs' ? 'transfer limit' : 'step limit'} is explicitly set at the ${currentLevel} level`,
    };
  }

  // No current value - check what would be inherited
  if (limitType === 'transferCountIs') {
    // transferCountIs: Project → Graph only
    if (currentLevel === 'graph' && hasParentValue) {
      return {
        isExplicit: false,
        inheritedFrom: 'Project',
        tooltip: 'Will inherit transfer limit from the project level',
      };
    }
  } else if (limitType === 'stepCountIs') {
    // stepCountIs: Project → Agent only
    if (currentLevel === 'agent' && hasParentValue) {
      return {
        isExplicit: false,
        inheritedFrom: 'Project',
        tooltip: 'Will inherit step limit from the project level',
      };
    }
  }

  // Using defaults
  const defaultValue = limitType === 'transferCountIs' ? '10' : '50';
  return {
    isExplicit: false,
    tooltip: `Using system default (${defaultValue})`,
  };
}
