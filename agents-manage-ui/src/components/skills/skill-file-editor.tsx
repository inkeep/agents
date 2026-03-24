'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { File, Folder, Plus } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { UnsavedChangesDialog } from '@/components/agent/unsaved-changes-dialog';
import { PromptEditor } from '@/components/editors/prompt-editor';
import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';
import { DeleteSkillConfirmation } from '@/components/skills/delete-skill-confirmation';
import { DeleteSkillFileConfirmation } from '@/components/skills/delete-skill-file-confirmation';
import { SkillFileSchema } from '@/components/skills/form/validation';
import type { DemoTreeNode } from '@/components/skills/tree-utils';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createSkillFileAction, updateSkillFileAction } from '@/lib/actions/skill-files';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import {
  buildNewSkillFileHref,
  buildSkillFileViewHref,
  buildSkillFolderViewHref,
  getSkillFileEditorUri,
  getSkillFileParentDirectory,
  getSkillFileRemovalLabel,
  isSkillEntryFile,
  SKILL_ENTRY_FILE_PATH,
} from '@/lib/utils/skill-files';

const resolver = zodResolver(SkillFileSchema);

interface SkillFileEditorProps {
  tenantId: string;
  projectId: string;
  skillId: string;
  fileId?: string;
  filePath: string;
  initialDirectoryPath?: string;
  initialContent: string;
}

function normalizeDirectoryPath(path: string): string {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeCreateFilePathInput(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildCreateFilePath(directoryPath: string, pathInput: string): string {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
  const normalizedPathInput = normalizeCreateFilePathInput(pathInput);

  return [normalizedDirectoryPath, normalizedPathInput].filter(Boolean).join('/');
}

function getDirectoryPathFromNode(node: DemoTreeNode): string | undefined {
  if (!node.skillId || node.path === node.skillId) {
    return;
  }

  return node.path.slice(node.skillId.length + 1);
}

function sortDirectoryChildren(nodes: readonly DemoTreeNode[]): DemoTreeNode[] {
  return nodes.toSorted((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'folder' ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

interface SkillDirectoryBrowserProps {
  tenantId: string;
  projectId: string;
  directoryNode: DemoTreeNode;
}

export const SkillDirectoryBrowser: FC<SkillDirectoryBrowserProps> = ({
  tenantId,
  projectId,
  directoryNode,
}) => {
  'use memo';
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const skillId = directoryNode.skillId;

  if (!skillId) {
    return null;
  }

  const directoryPath = getDirectoryPathFromNode(directoryNode);
  const parentDirectoryPath = directoryPath
    ? getSkillFileParentDirectory(directoryPath)
    : undefined;
  const parentHref = directoryPath
    ? buildSkillFolderViewHref(tenantId, projectId, skillId, parentDirectoryPath || undefined)
    : undefined;
  const createHref = canEdit
    ? buildNewSkillFileHref(tenantId, projectId, skillId, directoryPath)
    : undefined;
  const segments = directoryNode.path.split('/').filter(Boolean);
  const children = sortDirectoryChildren(directoryNode.children);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b px-4 gap-2 h-(--header-height) shrink-0">
        <BreadcrumbNav>
          {segments.map((segment, index, arr) => {
            const isLast = index === arr.length - 1;
            const href = buildSkillFolderViewHref(
              tenantId,
              projectId,
              skillId,
              index === 0 ? undefined : arr.slice(1, index + 1).join('/')
            );

            return (
              <BreadcrumbNav.Item key={`${segment}-${index}`} href={href} isLast={isLast}>
                {segment}
              </BreadcrumbNav.Item>
            );
          })}
        </BreadcrumbNav>
        {createHref && (
          <Button asChild size="sm" className="ml-auto">
            <NextLink href={createHref}>
              <Plus />
              Add file
            </NextLink>
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y">
          {parentHref && (
            <NextLink
              href={parentHref}
              className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Folder className="size-4" />
              ..
            </NextLink>
          )}
          {children.map((child) => {
            const childDirectoryPath = getDirectoryPathFromNode(child);
            const childHref =
              child.kind === 'folder'
                ? buildSkillFolderViewHref(tenantId, projectId, skillId, childDirectoryPath)
                : child.filePath
                  ? buildSkillFileViewHref(tenantId, projectId, skillId, child.filePath)
                  : '';
            const Icon = child.kind === 'folder' ? Folder : File;

            return (
              <NextLink
                key={child.path}
                href={childHref}
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="truncate">{child.name}</span>
              </NextLink>
            );
          })}
          {!children.length && (
            <div className="px-4 py-6 text-sm text-muted-foreground">This folder is empty.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SkillFileEditor: FC<SkillFileEditorProps> = ({
  tenantId,
  projectId,
  skillId,
  fileId,
  filePath,
  initialDirectoryPath,
  initialContent,
}) => {
  'use memo';
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
  const router = useRouter();
  const isCreateMode = !fileId;
  const createDirectoryPath = normalizeDirectoryPath(initialDirectoryPath ?? '');
  const form = useForm({
    resolver,
    defaultValues: {
      filePath: isCreateMode ? '' : filePath,
      content: initialContent,
    },
    mode: 'onChange',
  });
  const watchedFilePath = useWatch({ control: form.control, name: 'filePath' });
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const { isDirty, isValid, isSubmitting } = form.formState;
  const currentFilePath = isCreateMode
    ? buildCreateFilePath(createDirectoryPath, watchedFilePath ?? '')
    : filePath;
  const breadcrumbPath = isCreateMode ? createDirectoryPath : filePath;
  const breadcrumbSegments = [skillId, ...breadcrumbPath.split('/').filter(Boolean)];
  const isSaveDisabled = isSubmitting || !canEdit || !isDirty || !isValid;
  const isEntryFile = !isCreateMode && isSkillEntryFile(filePath);

  const handleSave = async (): Promise<boolean> => {
    if (!canEdit || (!isCreateMode && !isDirty)) {
      return true;
    }

    let didSave = false;

    await form.handleSubmit(async ({ filePath, extension, content }) => {
      const filePathWithExt = `${filePath}${extension}`;
      const nextFilePath = isCreateMode
        ? buildCreateFilePath(createDirectoryPath, filePathWithExt)
        : filePathWithExt;

      try {
        const result = isCreateMode
          ? await createSkillFileAction(tenantId, projectId, skillId, nextFilePath, content)
          : await updateSkillFileAction(tenantId, projectId, skillId, fileId, filePath, content);

        if (!result.success) {
          toast.error(result.error ?? `Failed to ${isCreateMode ? 'create' : 'update'} skill file`);
          return;
        }

        const savedFilePath = result.data?.filePath ?? nextFilePath;
        toast.success(isCreateMode ? `Created ${savedFilePath}` : `Saved ${filePath}`);

        if (isCreateMode) {
          router.push(buildSkillFileViewHref(tenantId, projectId, skillId, savedFilePath));
          router.refresh();
          didSave = true;
          return;
        }

        form.reset({ filePath, content });
        router.refresh();
        didSave = true;
      } catch {}
    })();

    return didSave;
  };

  return (
    <Form {...form}>
      <form
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <div className="flex items-center border-b px-4 gap-2 h-(--header-height) shrink-0">
          <BreadcrumbNav>
            {breadcrumbSegments.map((segment, idx, arr) => {
              const isLastPathSegment = idx === arr.length - 1;
              const subPath = idx === 0 ? undefined : arr.slice(1, idx + 1).join('/');

              const href = buildSkillFolderViewHref(tenantId, projectId, skillId, subPath);

              return (
                <BreadcrumbNav.Item
                  key={`${segment}-${idx}`}
                  href={href}
                  isLast={!isCreateMode && isLastPathSegment}
                >
                  {segment}
                </BreadcrumbNav.Item>
              );
            })}
            {isCreateMode && (
              <BreadcrumbNav.Item isLast href="">
                <FormField
                  control={form.control}
                  name="filePath"
                  render={({ field }) => (
                    <FormItem className="flex items-center py-1">
                      <ButtonGroup>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="filename"
                            disabled={!canEdit}
                            className="w-auto"
                          />
                        </FormControl>
                        <FormField
                          control={form.control}
                          name="extension"
                          render={({ field }) => (
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                              defaultValue=".md"
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="ext" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {Object.keys(SkillFileSchema.shape.extension.unwrap().enum).map(
                                    (ext) => (
                                      <SelectItem key={ext} value={ext}>
                                        {ext}
                                      </SelectItem>
                                    )
                                  )}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </ButtonGroup>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </BreadcrumbNav.Item>
            )}
          </BreadcrumbNav>
          {canEdit && (
            <div className="ml-auto flex gap-1">
              {!isCreateMode && (
                <Button
                  type="button"
                  variant="destructive-outline"
                  onClick={() => setIsDeleteOpen(true)}
                  size="sm"
                >
                  {getSkillFileRemovalLabel(filePath)}
                  {isDeleteOpen &&
                    (isEntryFile ? (
                      <DeleteSkillConfirmation skillId={skillId} setIsOpen={setIsDeleteOpen} />
                    ) : (
                      <DeleteSkillFileConfirmation
                        skillId={skillId}
                        fileId={fileId}
                        filePath={filePath}
                        redirectPath={buildSkillFileViewHref(
                          tenantId,
                          projectId,
                          skillId,
                          SKILL_ENTRY_FILE_PATH
                        )}
                        setIsOpen={setIsDeleteOpen}
                      />
                    ))}
                </Button>
              )}
              <Button type="submit" disabled={isSaveDisabled} size="sm">
                Save
              </Button>
              <UnsavedChangesDialog dirty={canEdit && isDirty} onSubmit={handleSave} />
            </div>
          )}
        </div>
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem className="contents">
              <FormControl>
                <PromptEditor
                  uri={getSkillFileEditorUri(currentFilePath)}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  readOnly={!canEdit}
                  hasDynamicHeight={false}
                  className="grow border-none rounded-none has-[&>.focused]:ring-transparent"
                  editorOptions={{
                    lineNumbers: 'on',
                  }}
                />
              </FormControl>
              <FormMessage className="p-4" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
