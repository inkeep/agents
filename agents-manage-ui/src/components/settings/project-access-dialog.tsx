'use client';

import { type ProjectRole, ProjectRoles } from '@inkeep/agents-core/client-exports';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getProjectRoleLabel,
  ProjectRoleSelector,
} from '@/components/access/project-role-selector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  addProjectMember,
  listUserProjectMemberships,
  removeProjectMember,
  updateProjectMember,
} from '@/lib/api/project-members';
import { fetchProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/types/project';

interface ProjectAssignment {
  role: ProjectRole;
  isNew?: boolean;
  originalRole?: ProjectRole;
  removed?: boolean;
}

interface ProjectAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string;
  userName: string;
  mode: 'assign' | 'manage';
  readOnly?: boolean;
  onComplete?: () => void;
}

export function ProjectAccessDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  userName,
  mode,
  readOnly = false,
  onComplete,
}: ProjectAccessDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<Map<string, ProjectAssignment>>(new Map());
  const [originalAssignments, setOriginalAssignments] = useState<Map<string, ProjectRole>>(
    new Map()
  );

  // Load data when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadData = async () => {
      setLoading(true);

      try {
        const [projectsRes, membershipsRes] = await Promise.all([
          fetchProjects(tenantId),
          mode === 'manage'
            ? listUserProjectMemberships({ tenantId, userId })
            : Promise.resolve({ data: [] }),
        ]);

        if (cancelled) return;

        const projectsData = projectsRes.data || [];
        const assignmentsMap = new Map<string, ProjectAssignment>();
        const originalsMap = new Map<string, ProjectRole>();

        for (const m of membershipsRes.data || []) {
          assignmentsMap.set(m.projectId, {
            role: m.role,
            isNew: false,
            originalRole: m.role,
          });
          originalsMap.set(m.projectId, m.role);
        }

        setProjects(projectsData);
        setAssignments(assignmentsMap);
        setOriginalAssignments(originalsMap);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        toast.error('Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, userId, mode]);

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setProjects([]);
      setAssignments(new Map());
      setOriginalAssignments(new Map());
      setLoading(true);
    }
    onOpenChange(isOpen);
  };

  const toggleProject = (projectId: string) => {
    const updated = new Map(assignments);
    const existing = updated.get(projectId);
    const wasOriginal = originalAssignments.has(projectId);

    if (existing && !existing.removed) {
      if (wasOriginal) {
        updated.set(projectId, { ...existing, removed: true });
      } else {
        updated.delete(projectId);
      }
    } else if (existing?.removed) {
      updated.set(projectId, {
        role: existing.originalRole || ProjectRoles.VIEWER,
        isNew: false,
        originalRole: existing.originalRole,
        removed: false,
      });
    } else {
      updated.set(projectId, { role: ProjectRoles.VIEWER, isNew: true });
    }

    setAssignments(updated);
  };

  const setProjectRole = (projectId: string, role: ProjectRole) => {
    const updated = new Map(assignments);
    const existing = updated.get(projectId);
    if (existing) {
      updated.set(projectId, { ...existing, role });
    }
    setAssignments(updated);
  };

  const hasChanges = () => {
    for (const [, a] of assignments) {
      if (a.isNew && !a.removed) return true;
      if (a.removed) return true;
      if (a.originalRole && a.role !== a.originalRole) return true;
    }
    return false;
  };

  const handleSubmit = async () => {
    if (!hasChanges() && mode === 'manage') {
      handleOpenChange(false);
      return;
    }

    setSubmitting(true);
    const errors: string[] = [];

    for (const [projectId, a] of assignments) {
      try {
        if (a.removed && a.originalRole) {
          await removeProjectMember({ tenantId, projectId, userId, role: a.originalRole });
        } else if (a.isNew && !a.removed) {
          await addProjectMember({ tenantId, projectId, userId, role: a.role });
        } else if (a.originalRole && a.role !== a.originalRole && !a.removed) {
          await updateProjectMember({
            tenantId,
            projectId,
            userId,
            role: a.role,
            previousRole: a.originalRole,
          });
        }
      } catch {
        errors.push(projectId);
      }
    }

    if (errors.length === 0) {
      const summary = [];
      let added = 0,
        removed = 0,
        changed = 0;
      for (const [, a] of assignments) {
        if (a.isNew && !a.removed) added++;
        else if (a.removed) removed++;
        else if (a.originalRole && a.role !== a.originalRole) changed++;
      }
      if (added > 0) summary.push(`${added} added`);
      if (removed > 0) summary.push(`${removed} removed`);
      if (changed > 0) summary.push(`${changed} updated`);

      toast.success('Project access updated', {
        description: summary.join(', ') || 'No changes made',
      });
    } else {
      toast.error('Some updates failed', {
        description: `${errors.length} project(s) could not be updated.`,
      });
    }

    setSubmitting(false);
    handleOpenChange(false);
    onComplete?.();
  };

  const handleCancel = () => {
    handleOpenChange(false);
    if (mode === 'assign') onComplete?.();
  };

  const activeCount = Array.from(assignments.values()).filter(
    (a) => !a.removed && (a.isNew || a.originalRole)
  ).length;

  const description = readOnly
    ? `View ${userName}'s project access.`
    : mode === 'assign'
      ? `${userName} has been changed to Member. Select which projects they should have access to.`
      : `Manage ${userName}'s project access.`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? 'Project Access'
              : mode === 'assign'
                ? 'Assign to Projects'
                : 'Project Access'}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3 max-h-[300px] overflow-y-auto">
          {loading ? (
            // Skeleton loading state
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48 mt-1" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : projects.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              No access to any projects.
            </div>
          ) : (
            projects.map((project) => {
              const assignment = assignments.get(project.projectId);
              const isSelected = assignment && !assignment.removed;
              const wasRemoved = assignment?.removed;

              return (
                <div
                  key={project.projectId}
                  className={`rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : wasRemoved
                        ? 'border-destructive/30 bg-destructive/5'
                        : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`project-${project.projectId}`}
                      checked={!!isSelected}
                      onCheckedChange={() => toggleProject(project.projectId)}
                      disabled={readOnly}
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`project-${project.projectId}`}
                        className={`font-medium ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${wasRemoved ? 'line-through text-muted-foreground' : ''}`}
                      >
                        {project.name}
                      </Label>
                      {project.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {project.description}
                        </p>
                      )}
                    </div>
                    {isSelected &&
                      assignment?.role &&
                      (readOnly ? (
                        <Badge
                          variant="secondary"
                          className="text-muted-foreground normal-case text-xs"
                        >
                          {getProjectRoleLabel(assignment.role)}
                        </Badge>
                      ) : (
                        <ProjectRoleSelector
                          value={assignment.role}
                          onChange={(role) => setProjectRole(project.projectId, role)}
                        />
                      ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Always render footer container to prevent layout shift */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-4 min-h-[28px]">
          {!loading && (activeCount > 0 || (!readOnly && hasChanges())) && (
            <>
              <span>Access:</span>
              <Badge variant="secondary">
                {activeCount} project{activeCount !== 1 ? 's' : ''}
              </Badge>
              {!readOnly && hasChanges() && mode === 'manage' && (
                <Badge variant="outline" className="text-amber-600">
                  Unsaved changes
                </Badge>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {readOnly ? (
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleCancel} disabled={submitting}>
                {mode === 'assign' ? 'Skip' : 'Cancel'}
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || loading || (mode === 'manage' && !hasChanges())}
              >
                {submitting
                  ? 'Saving...'
                  : mode === 'assign'
                    ? activeCount > 0
                      ? `Assign to ${activeCount} Project${activeCount > 1 ? 's' : ''}`
                      : 'Done'
                    : 'Save Changes'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
