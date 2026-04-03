'use client';

import { ChevronRight, File, Folder, FolderOpenIcon, Plus, Trash2 } from 'lucide-react';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import { cn } from '@/lib/utils';
import {
  buildNewSkillFileHref,
  buildSkillFileViewHref,
  buildSkillFolderViewHref,
  getSkillFileParentDirectory,
  getSkillFileRemovalLabel,
  isSkillEntryFile,
  SKILL_ENTRY_FILE_PATH,
} from '@/lib/utils/skill-files';

export const TreeNode: FC<{
  node: DemoTreeNode;
  selectedNodePath: string;
  nested?: boolean;
}> = ({ node, nested = false, selectedNodePath }) => {
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const router = useRouter();

  const [isCollapsed, setCollapsed] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const isFile = node.kind === 'file';

  const isActive = node.path === selectedNodePath;
  const IconToUse = isFile ? File : isCollapsed ? Folder : FolderOpenIcon;
  const isEntryFile = isFile && node.filePath ? isSkillEntryFile(node.filePath) : false;
  const isSelectedSkill =
    node.skillId &&
    (selectedNodePath === node.skillId || selectedNodePath.startsWith(`${node.skillId}/`));
  const directoryPath =
    !isFile && node.skillId && node.path !== node.skillId
      ? node.path.slice(node.skillId.length + 1)
      : undefined;
  const href =
    node.skillId && node.filePath
      ? buildSkillFileViewHref(tenantId, projectId, node.skillId, node.filePath)
      : node.skillId
        ? buildSkillFolderViewHref(tenantId, projectId, node.skillId, directoryPath)
        : '';
  const ComponentToUse = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const ButtonToUse = nested ? SidebarMenuSubButton : SidebarMenuButton;

  const content = (
    <>
      <IconToUse stroke="var(--color-muted-foreground)" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
    </>
  );

  const createTarget =
    node.skillId &&
    (isFile
      ? {
          skillId: node.skillId,
          directoryPath: node.filePath ? getSkillFileParentDirectory(node.filePath) : undefined,
        }
      : {
          skillId: node.skillId,
          directoryPath:
            node.path === node.skillId ? undefined : node.path.slice(node.skillId.length + 1),
        });

  const createHref =
    createTarget &&
    buildNewSkillFileHref(
      tenantId,
      projectId,
      createTarget.skillId,
      createTarget.directoryPath || undefined
    );

  function handleCollapse(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    setCollapsed((v) => !v);
  }

  const renderAddFileItem = () =>
    createHref ? (
      <ContextMenuItem onSelect={() => router.push(createHref)}>
        <Plus />
        Add file
      </ContextMenuItem>
    ) : null;

  return (
    <ComponentToUse key={node.path}>
      {isFile
        ? (() => {
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
                      {renderAddFileItem()}
                      <ContextMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                        <Trash2 />
                        {getSkillFileRemovalLabel(node.filePath ?? '')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ) : (
                  button
                )}
                {isDeleteOpen && node.skillId && node.fileId && node.filePath && (
                  <>
                    {isEntryFile ? (
                      <DeleteSkillConfirmation
                        skillId={node.skillId}
                        setIsOpen={setIsDeleteOpen}
                        redirectOnDelete={Boolean(isSelectedSkill)}
                      />
                    ) : (
                      <DeleteSkillFileConfirmation
                        skillId={node.skillId}
                        fileId={node.fileId}
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
        : (() => {
            const button = (
              <div>
                <ButtonToUse asChild isActive={isActive} className="w-full pr-8">
                  <NextLink href={href}>{content}</NextLink>
                </ButtonToUse>
                <SidebarMenuAction
                  className={cn('top-1', !isCollapsed && 'rotate-90')}
                  onClick={handleCollapse}
                >
                  <ChevronRight className="size-4" />
                </SidebarMenuAction>
              </div>
            );

            return canEdit && createHref ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
                <ContextMenuContent>{renderAddFileItem()}</ContextMenuContent>
              </ContextMenu>
            ) : (
              button
            );
          })()}
      {node.children.length > 0 && !isCollapsed && (
        <SidebarMenuSub className="pr-0 mr-0">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} selectedNodePath={selectedNodePath} nested />
          ))}
        </SidebarMenuSub>
      )}
    </ComponentToUse>
  );
};
