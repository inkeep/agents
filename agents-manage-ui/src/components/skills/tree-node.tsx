'use client';

import { ChevronRight, File, Folder, FolderOpenIcon, Trash2 } from 'lucide-react';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';
import { type FC, type MouseEvent, useState } from 'react';
import { DeleteSkillConfirmation } from '@/components/skills/delete-skill-confirmation';
import { DeleteSkillFileConfirmation } from '@/components/skills/delete-skill-file-confirmation';
import type { DemoTreeNode } from '@/components/skills/tree-utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import {
  buildSkillFileViewHref,
  getSkillFileRemovalLabel,
  isSkillEntryFile,
  SKILL_ENTRY_FILE_PATH,
} from '@/lib/utils/skill-files';

export const TreeNode: FC<{
  node: DemoTreeNode;
  selectedRoutePath: string;
  canEdit: boolean;
  nested?: boolean;
}> = ({ node, nested = false, selectedRoutePath, canEdit }) => {
  'use memo';

  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const [isCollapsed, setCollapsed] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isFile = node.kind === 'file';

  const isActive = isFile && node.routePath === selectedRoutePath;
  const IconToUse = isFile ? File : isCollapsed ? Folder : FolderOpenIcon;
  const isEntryFile = isFile && node.filePath ? isSkillEntryFile(node.filePath) : false;
  const isSelectedSkill =
    isFile &&
    node.skillId &&
    (selectedRoutePath === node.skillId || selectedRoutePath.startsWith(`${node.skillId}/`));
  const href =
    isFile && node.skillId && node.filePath
      ? buildSkillFileViewHref(tenantId, projectId, node.skillId, node.filePath)
      : '';
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;

  const content = (
    <>
      <IconToUse stroke="var(--color-muted-foreground)" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </>
  );

  function handleCollapse(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    setCollapsed((v) => !v);
  }

  return (
    <ComponentToUse key={node.path}>
      {isFile ? (
        (() => {
          const button = (
            <SidebarMenuButton className="px-0!">
              <ButtonToUse asChild isActive={isActive} className="w-full">
                <NextLink href={href}>{content}</NextLink>
              </ButtonToUse>
            </SidebarMenuButton>
          );
          return (
            <>
              {canEdit ? (
                <ContextMenu>
                  <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                      <Trash2 />
                      {getSkillFileRemovalLabel(node.filePath ?? '')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ) : (
                button
              )}
              {isDeleteOpen && node.skillId && node.filePath && (
                <>
                  {isEntryFile ? (
                    <DeleteSkillConfirmation
                      tenantId={tenantId}
                      projectId={projectId}
                      skillId={node.skillId}
                      skillName={node.skillName ?? node.skillId}
                      setIsOpen={setIsDeleteOpen}
                      redirectOnDelete={Boolean(isSelectedSkill)}
                    />
                  ) : (
                    <DeleteSkillFileConfirmation
                      tenantId={tenantId}
                      projectId={projectId}
                      skillId={node.skillId}
                      filePath={node.filePath}
                      redirectPath={
                        isActive
                          ? buildSkillFileViewHref(
                              tenantId,
                              projectId,
                              node.skillId,
                              SKILL_ENTRY_FILE_PATH
                            )
                          : undefined
                      }
                      setIsOpen={setIsDeleteOpen}
                    />
                  )}
                </>
              )}
            </>
          );
        })()
      ) : (
        <>
          <SidebarMenuSubButton onClick={handleCollapse} className="cursor-pointer">
            {content}
          </SidebarMenuSubButton>
          <SidebarMenuAction className={cn(!isCollapsed && 'rotate-90')} onClick={handleCollapse}>
            <ChevronRight className="size-4" />
          </SidebarMenuAction>
        </>
      )}
      {node.children.length > 0 && !isCollapsed && (
        <SidebarMenuSub className="pr-0 mr-0">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedRoutePath={selectedRoutePath}
              canEdit={canEdit}
              nested
            />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};
