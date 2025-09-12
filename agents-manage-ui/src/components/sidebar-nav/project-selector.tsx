import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Project } from '@/lib/types/project';

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId?: string;
  tenantId?: string;
}

export function ProjectSelector({ projects, selectedProjectId, tenantId }: ProjectSelectorProps) {
  const [open, setOpen] = useState(false);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const router = useRouter();

  const selectedProject = projects.find((p) => p.projectId === selectedProjectId);

  return (
    <div className="flex w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            className="w-full h-auto justify-between bg-transparent text-foreground pr-2"
          >
            {selectedProject ? (
              <div className="flex flex-col text-left min-w-0 flex-1">
                <span className="font-medium truncate text-foreground">
                  {selectedProject.name || selectedProject.projectId}
                </span>
                <span className="text-muted-foreground truncate text-xs">{tenantId}</span>
              </div>
            ) : (
              <div className="text-muted-foreground">Select a project</div>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandEmpty>No projects found</CommandEmpty>
            <CommandList className="max-h-64">
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.projectId}
                    onSelect={() => {
                      router.push(`/${tenantId}/projects/${project.projectId}`);
                      setOpen(false);
                    }}
                    className="flex items-start gap-3 px-3 py-2 group cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{project.name || project.projectId}</span>
                        {project.projectId === selectedProjectId && (
                          <span className="text-muted-foreground">
                            <Check className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      {project.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {project.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false);
                    setShowNewProjectDialog(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-foreground" />
                  <span className="font-medium text-foreground uppercase font-mono tracking-wider">
                    Create Project
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {tenantId && (
        <NewProjectDialog
          tenantId={tenantId}
          open={showNewProjectDialog}
          onOpenChange={setShowNewProjectDialog}
        />
      )}
    </div>
  );
}
