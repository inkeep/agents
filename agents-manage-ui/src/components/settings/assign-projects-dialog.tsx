'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ProjectRole, ProjectRoles } from '@inkeep/agents-core/client-exports';
import { addProjectMember } from '@/lib/api/project-members';
import { fetchProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/types/project';

const PROJECT_ROLES: { value: ProjectRole; label: string; description: string }[] = [
  { value: ProjectRoles.ADMIN, label: 'Admin', description: 'Full access to manage the project' },
  { value: ProjectRoles.MEMBER, label: 'Member', description: 'Can edit and collaborate' },
  { value: ProjectRoles.VIEWER, label: 'Viewer', description: 'Read-only access' },
];

interface AssignProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string;
  userName: string;
  onComplete?: () => void;
}

export function AssignProjectsDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  userName,
  onComplete,
}: AssignProjectsDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<Map<string, ProjectRole>>(new Map());

  useEffect(() => {
    if (!open) return;

    const loadProjects = async () => {
      setLoading(true);
      setAssignments(new Map());
      try {
        const response = await fetchProjects(tenantId);
        setProjects(response.data || []);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        toast.error('Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [open, tenantId]);

  const toggleProject = (projectId: string) => {
    const newAssignments = new Map(assignments);
    if (newAssignments.has(projectId)) {
      newAssignments.delete(projectId);
    } else {
      newAssignments.set(projectId, ProjectRoles.MEMBER);
    }
    setAssignments(newAssignments);
  };

  const setProjectRole = (projectId: string, role: ProjectRole) => {
    const newAssignments = new Map(assignments);
    newAssignments.set(projectId, role);
    setAssignments(newAssignments);
  };

  const handleSubmit = async () => {
    if (assignments.size === 0) {
      onOpenChange(false);
      onComplete?.();
      return;
    }

    setSubmitting(true);
    const results: { projectId: string; success: boolean; error?: string }[] = [];

    for (const [projectId, role] of assignments) {
      try {
        await addProjectMember({
          tenantId,
          projectId,
          userId,
          role,
        });
        results.push({ projectId, success: true });
      } catch (err) {
        results.push({
          projectId,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (failCount === 0) {
      toast.success('Projects assigned', {
        description: `${userName} has been added to ${successCount} project${successCount > 1 ? 's' : ''}.`,
      });
    } else if (successCount > 0) {
      toast.warning('Partially assigned', {
        description: `Added to ${successCount} project${successCount > 1 ? 's' : ''}, ${failCount} failed.`,
      });
    } else {
      toast.error('Failed to assign projects', {
        description: 'Could not add the member to any projects.',
      });
    }

    setSubmitting(false);
    onOpenChange(false);
    onComplete?.();
  };

  const handleSkip = () => {
    onOpenChange(false);
    onComplete?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign to Projects</DialogTitle>
          <DialogDescription>
            {userName} has been changed to Member. Select which projects they should have access to.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No projects found in this organization.
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {projects.map((project) => {
                const isSelected = assignments.has(project.projectId);
                const selectedRole = assignments.get(project.projectId);

                return (
                  <div
                    key={project.projectId}
                    className={`rounded-lg border p-3 transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`project-${project.projectId}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleProject(project.projectId)}
                      />
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`project-${project.projectId}`}
                          className="font-medium cursor-pointer"
                        >
                          {project.name}
                        </Label>
                        {project.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {project.description}
                          </p>
                        )}
                      </div>
                      {isSelected && (
                        <Select
                          value={selectedRole}
                          onValueChange={(value: ProjectRole) =>
                            setProjectRole(project.projectId, value)
                          }
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_ROLES.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {assignments.size > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Selected:</span>
                <Badge variant="secondary">
                  {assignments.size} project{assignments.size > 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleSkip} disabled={submitting}>
            Skip
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting || loading}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning...
              </>
            ) : assignments.size > 0 ? (
              `Assign to ${assignments.size} Project${assignments.size > 1 ? 's' : ''}`
            ) : (
              'Done'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
