---
name: pr-context
description: Local review context generated from git state.
---

# PR Review Context

(!IMPORTANT)

Use this context to:
1. Get an initial sense of the purpose and scope of the local changes
2. Review the current branch against the target branch without relying on GitHub APIs
3. Identify what needs attention before the changes are pushed

---

## PR Metadata

| Field | Value |
|---|---|
| **PR** | Local review — prd-6447 vs main |
| **Author** | sarah_inkeep |
| **Base** | `main` |
| **Repo** | inkeep/agents |
| **Head SHA** | `400427d20a8ddc2381150fc63f87f0a0ea3bb845` |
| **Size** | 1 commits · +190/-180 · 8 files |
| **Labels** | _None — local review._ |
| **Review state** | LOCAL |
| **Diff mode** | `inline` — full tracked diff included below |
| **Event** | `local:manual` |
| **Trigger command** | `local-review` |
| **Review scope** | `full` — local review uses the full branch diff against the target branch |

## Description

Local review — no PR description is available.

## Linked Issues

_No linked issues in local review mode._

## Commit History

Commits reachable from HEAD and not in the target branch (oldest → newest). Local staged and unstaged changes may also be present in the diff below.

```
400427d20 fixup! local-review: baseline (pre-review state)
```

## Changed Files

Per-file diff stats (for prioritizing review effort). Untracked files are listed below but are not converted into synthetic patch text by this generator:

```
 agents-docs/package.json                           |   4 +-
 agents-manage-ui/package.json                      |   2 +-
 .../components/agent/playground/chat-widget.tsx    |  39 +----
 .../agent/playground/feedback-dialog.tsx           |  52 +------
 .../components/agent/playground/improve-dialog.tsx |  97 ++++++++++++
 .../src/components/feedback/feedback-table.tsx     | 165 +++++++++------------
 .../src/components/traces/filters/date-picker.tsx  |   9 +-
 agents-ui-demo/package.json                        |   2 +-
 8 files changed, 190 insertions(+), 180 deletions(-)
```

Full file list (including untracked files when present):

```
agents-docs/package.json
agents-manage-ui/package.json
agents-manage-ui/src/components/agent/playground/chat-widget.tsx
agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
agents-manage-ui/src/components/agent/playground/improve-dialog.tsx
agents-manage-ui/src/components/feedback/feedback-table.tsx
agents-manage-ui/src/components/traces/filters/date-picker.tsx
agents-ui-demo/package.json
```

## Diff

```diff
diff --git a/agents-docs/package.json b/agents-docs/package.json
index 36666f8bc..ecc384f67 100644
--- a/agents-docs/package.json
+++ b/agents-docs/package.json
@@ -26,8 +26,8 @@
   "dependencies": {
     "@inkeep/agents-cli": "workspace:*",
     "@inkeep/agents-core": "workspace:*",
-    "@inkeep/agents-ui": "^0.15.29",
-    "@inkeep/agents-ui-cloud": "^0.15.29",
+    "@inkeep/agents-ui": "^0.15.30",
+    "@inkeep/agents-ui-cloud": "^0.15.30",
     "@inkeep/docskit": "^0.0.8",
     "@radix-ui/react-collapsible": "^1.1.1",
     "@radix-ui/react-popover": "^1.1.14",
diff --git a/agents-manage-ui/package.json b/agents-manage-ui/package.json
index fe3485f75..06306ba0d 100644
--- a/agents-manage-ui/package.json
+++ b/agents-manage-ui/package.json
@@ -55,7 +55,7 @@
     "@better-auth/sso": "catalog:",
     "@hookform/resolvers": "^5.2.1",
     "@inkeep/agents-core": "workspace:^",
-    "@inkeep/agents-ui": "^0.15.29",
+    "@inkeep/agents-ui": "^0.15.30",
     "@nangohq/frontend": "^0.69.41",
     "@nangohq/node": "^0.69.41",
     "@nangohq/types": "^0.69.41",
diff --git a/agents-manage-ui/src/components/agent/playground/chat-widget.tsx b/agents-manage-ui/src/components/agent/playground/chat-widget.tsx
index 61514cf6f..ffbaa61e8 100644
--- a/agents-manage-ui/src/components/agent/playground/chat-widget.tsx
+++ b/agents-manage-ui/src/components/agent/playground/chat-widget.tsx
@@ -10,7 +10,7 @@ import { useRuntimeConfig } from '@/contexts/runtime-config';
 import { useTempApiKey } from '@/hooks/use-temp-api-key';
 import { useDataComponentsQuery } from '@/lib/query/data-components';
 import { css } from '@/lib/utils';
-import { FeedbackDialog } from './feedback-dialog';
+import { ImproveDialog } from './improve-dialog';
 
 interface ChatWidgetProps {
   agentId?: string;
@@ -73,7 +73,7 @@ export function ChatWidget({
   stopPolling,
   customHeaders,
   chatActivities,
-  setShowTraces: _setShowTraces,
+  setShowTraces,
   hasHeadersError,
 }: ChatWidgetProps) {
   const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
@@ -81,7 +81,6 @@ export function ChatWidget({
   const { data: dataComponents } = useDataComponentsQuery();
   const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
   const [messageId, setMessageId] = useState<string | undefined>(undefined);
-  const [feedbackType, setFeedbackType] = useState<'positive' | 'negative'>('negative');
   const {
     apiKey: tempApiKey,
     appId: playgroundAppId,
@@ -248,30 +247,6 @@ export function ChatWidget({
               ...customHeaders,
             },
             messageActions: [
-              {
-                label: '',
-                icon: { builtIn: 'LuThumbsUp' },
-                action: {
-                  type: 'invoke_message_callback',
-                  callback({ messageId }) {
-                    setMessageId(messageId);
-                    setFeedbackType('positive');
-                    setIsFeedbackDialogOpen(true);
-                  },
-                },
-              },
-              {
-                label: '',
-                icon: { builtIn: 'LuThumbsDown' },
-                action: {
-                  type: 'invoke_message_callback',
-                  callback({ messageId }) {
-                    setMessageId(messageId);
-                    setFeedbackType('negative');
-                    setIsFeedbackDialogOpen(true);
-                  },
-                },
-              },
               ...(copilotCtx.isCopilotConfigured
                 ? [
                     {
@@ -280,8 +255,8 @@ export function ChatWidget({
                       action: {
                         type: 'invoke_message_callback' as const,
                         callback({ messageId }: { messageId?: string }) {
-                          copilotCtx.openCopilot();
-                          copilotCtx.setDynamicHeaders({ conversationId, messageId });
+                          setMessageId(messageId);
+                          setIsFeedbackDialogOpen(true);
                         },
                       },
                     },
@@ -317,14 +292,12 @@ export function ChatWidget({
         />
       </div>
       {isFeedbackDialogOpen && (
-        <FeedbackDialog
+        <ImproveDialog
           isOpen={isFeedbackDialogOpen}
           onOpenChange={setIsFeedbackDialogOpen}
-          tenantId={tenantId}
-          projectId={projectId}
           conversationId={conversationId}
           messageId={messageId}
-          initialType={feedbackType}
+          setShowTraces={setShowTraces}
         />
       )}
     </div>
diff --git a/agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx b/agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
index bea0ace6c..c2f4b7fa0 100644
--- a/agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
+++ b/agents-manage-ui/src/components/agent/playground/feedback-dialog.tsx
@@ -1,10 +1,8 @@
 import { zodResolver } from '@hookform/resolvers/zod';
-import { ThumbsDown, ThumbsUp } from 'lucide-react';
 import { useEffect } from 'react';
 import { useForm, useWatch } from 'react-hook-form';
 import { toast } from 'sonner';
 import { z } from 'zod';
-import { FormFieldWrapper } from '@/components/form/form-field-wrapper';
 import { GenericTextarea } from '@/components/form/generic-textarea';
 import { Button } from '@/components/ui/button';
 import {
@@ -14,7 +12,7 @@ import {
   DialogHeader,
   DialogTitle,
 } from '@/components/ui/dialog';
-import { Form, FormControl } from '@/components/ui/form';
+import { Form } from '@/components/ui/form';
 import { createFeedbackAction } from '@/lib/actions/feedback';
 
 interface FeedbackDialogProps {
@@ -104,7 +102,7 @@ export const FeedbackDialog = ({
 
   return (
     <Dialog open={isOpen} onOpenChange={onOpenChange}>
-      <DialogContent className="max-w-2xl!">
+      <DialogContent>
         <DialogHeader>
           <DialogTitle>Feedback</DialogTitle>
           <DialogDescription className="sr-only">
@@ -113,53 +111,19 @@ export const FeedbackDialog = ({
         </DialogHeader>
         <Form {...form}>
           <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
-            <FormFieldWrapper control={form.control} name="type" label="Sentiment">
-              {(field) => (
-                <FormControl>
-                  <div role="group" aria-label="Sentiment" className="flex items-center gap-2">
-                    <Button
-                      type="button"
-                      variant={field.value === 'positive' ? 'default' : 'outline'}
-                      size="sm"
-                      aria-pressed={field.value === 'positive'}
-                      onClick={() => field.onChange('positive')}
-                      className="gap-2"
-                    >
-                      <ThumbsUp className="size-4" />
-                      <span className="sr-only">Thumbs up</span>
-                      Like
-                    </Button>
-                    <Button
-                      type="button"
-                      variant={field.value === 'negative' ? 'default' : 'outline'}
-                      size="sm"
-                      aria-pressed={field.value === 'negative'}
-                      onClick={() => field.onChange('negative')}
-                      className="gap-2"
-                    >
-                      <ThumbsDown className="size-4" />
-                      <span className="sr-only">Thumbs down</span>
-                      Dislike
-                    </Button>
-                  </div>
-                </FormControl>
-              )}
-            </FormFieldWrapper>
-
             <GenericTextarea
               control={form.control}
               name="feedback"
-              label=""
-              placeholder={type === 'positive' ? 'What went well?' : 'What could have been better?'}
+              label={
+                type === 'positive'
+                  ? 'What did you like about this response?'
+                  : 'How can we improve this response?'
+              }
+              placeholder={'Provide additional details'}
               className="min-h-[80px]"
             />
             <div className="flex justify-end gap-2">
               <Button type="submit" disabled={isSubmitting}>
-                {type === 'negative' ? (
-                  <ThumbsDown className="size-4" />
-                ) : (
-                  <ThumbsUp className="size-4" />
-                )}
                 Submit feedback
               </Button>
             </div>
diff --git a/agents-manage-ui/src/components/agent/playground/improve-dialog.tsx b/agents-manage-ui/src/components/agent/playground/improve-dialog.tsx
new file mode 100644
index 000000000..0cd312e5c
--- /dev/null
+++ b/agents-manage-ui/src/components/agent/playground/improve-dialog.tsx
@@ -0,0 +1,97 @@
+import { zodResolver } from '@hookform/resolvers/zod';
+import { SparklesIcon } from 'lucide-react';
+import type { Dispatch } from 'react';
+import { useForm } from 'react-hook-form';
+import { z } from 'zod';
+import { GenericTextarea } from '@/components/form/generic-textarea';
+import { Button } from '@/components/ui/button';
+import {
+  Dialog,
+  DialogContent,
+  DialogDescription,
+  DialogHeader,
+  DialogTitle,
+} from '@/components/ui/dialog';
+import { Form } from '@/components/ui/form';
+import { useCopilotContext } from '@/contexts/copilot';
+
+interface ImproveDialogProps {
+  isOpen: boolean;
+  onOpenChange: (open: boolean) => void;
+  conversationId?: string;
+  messageId?: string;
+  setShowTraces: Dispatch<boolean>;
+}
+
+const feedbackSchema = z.object({
+  feedback: z
+    .string()
+    .min(1, 'Please provide details about what could have been better.')
+    .max(1000, 'Feedback must be less than 1000 characters'),
+});
+
+type FeedbackFormData = z.infer<typeof feedbackSchema>;
+
+export const ImproveDialog = ({
+  isOpen,
+  onOpenChange,
+  conversationId,
+  messageId,
+  setShowTraces,
+}: ImproveDialogProps) => {
+  const {
+    chatFunctionsRef: chatFunctionsREF,
+    openCopilot,
+    setDynamicHeaders,
+  } = useCopilotContext();
+  const form = useForm<FeedbackFormData>({
+    defaultValues: {
+      feedback: '',
+    },
+    resolver: zodResolver(feedbackSchema),
+  });
+  const { isSubmitting } = form.formState;
+
+  const onSubmit = form.handleSubmit(async ({ feedback }) => {
+    if (chatFunctionsREF.current) {
+      openCopilot();
+      setShowTraces(false);
+      setDynamicHeaders({ conversationId, messageId });
+      // todo this is a hack to ensure the message is submitted after the conversation id is set
+      setTimeout(() => {
+        chatFunctionsREF.current?.submitMessage(feedback);
+      }, 100);
+    }
+    onOpenChange(false);
+  });
+
+  return (
+    <Dialog open={isOpen} onOpenChange={onOpenChange}>
+      <DialogContent className="max-w-2xl!">
+        <DialogHeader>
+          <DialogTitle>Feedback</DialogTitle>
+          <DialogDescription className="sr-only">
+            Provide feedback on the message.
+          </DialogDescription>
+        </DialogHeader>
+        <Form {...form}>
+          <form onSubmit={onSubmit} className="space-y-8">
+            <GenericTextarea
+              control={form.control}
+              name="feedback"
+              label=""
+              placeholder="What could have been better?"
+              className="min-h-[80px]"
+            />
+            <div className="flex justify-end gap-2">
+              <Button type="submit" disabled={isSubmitting}>
+                <SparklesIcon className="size-4" />
+                Fix with Copilot
+              </Button>
+            </div>
+          </form>
+        </Form>
+      </DialogContent>
+    </Dialog>
+  );
+};
diff --git a/agents-manage-ui/src/components/feedback/feedback-table.tsx b/agents-manage-ui/src/components/feedback/feedback-table.tsx
index c3c357153..7c93ef376 100644
--- a/agents-manage-ui/src/components/feedback/feedback-table.tsx
+++ b/agents-manage-ui/src/components/feedback/feedback-table.tsx
@@ -26,6 +26,7 @@ import {
   TableHeader,
   TableRow,
 } from '@/components/ui/table';
+import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import type { Feedback } from '@/lib/api/feedback';
 import { formatDateTimeTable } from '@/lib/utils/format-date';
 
@@ -127,11 +128,6 @@ export function FeedbackTable({
     [pathname, router, searchParams]
   );
 
-  const clearFilters = () => {
-    setTypeFilter(undefined);
-    updateQuery({ type: '', agentId: '', startDate: '', endDate: '', page: 1 });
-  };
-
   const hasActiveFilters = !!(
     filters.type ||
     filters.agentId ||
@@ -160,57 +156,35 @@ export function FeedbackTable({
   return (
     <div className="space-y-4">
       <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
-        <div className="flex items-center gap-1">
-          <Button
-            variant={!typeFilter ? 'default' : 'outline'}
-            size="sm"
-            onClick={() => {
-              setTypeFilter(undefined);
-              updateQuery({ type: '', page: 1 });
-            }}
-          >
-            All
-            <Badge variant="count" className="ml-1 text-xs">
-              {!typeFilter ? pagination.total : ''}
-            </Badge>
-          </Button>
-          <Button
-            variant={typeFilter === 'positive' ? 'default' : 'outline'}
-            size="sm"
-            aria-pressed={typeFilter === 'positive'}
-            onClick={() => {
-              const next = typeFilter === 'positive' ? undefined : ('positive' as const);
-              setTypeFilter(next);
-              updateQuery({ type: next ?? '', page: 1 });
-            }}
-          >
-            <ThumbsUp className="h-3 w-3 mr-1" />
-            Positive
-            {positiveCount !== undefined && (
-              <Badge variant="count" className="ml-1 text-xs">
-                {positiveCount}
-              </Badge>
-            )}
-          </Button>
-          <Button
-            variant={typeFilter === 'negative' ? 'default' : 'outline'}
-            size="sm"
-            aria-pressed={typeFilter === 'negative'}
-            onClick={() => {
-              const next = typeFilter === 'negative' ? undefined : ('negative' as const);
-              setTypeFilter(next);
-              updateQuery({ type: next ?? '', page: 1 });
-            }}
-          >
-            <ThumbsDown className="h-3 w-3 mr-1" />
-            Negative
-            {negativeCount !== undefined && (
-              <Badge variant="count" className="ml-1 text-xs">
-                {negativeCount}
-              </Badge>
-            )}
-          </Button>
-        </div>
+        <Tabs
+          value={typeFilter ?? 'all'}
+          onValueChange={(value) => {
+            const next = value === 'all' ? undefined : (value as 'positive' | 'negative');
+            setTypeFilter(next);
+            updateQuery({ type: next ?? '', page: 1 });
+          }}
+        >
+          <TabsList className="">
+            <TabsTrigger value="all" className="gap-1.5 font-sans normal-case">
+              All
+              {!typeFilter && <span className="text-xs opacity-70">{pagination.total}</span>}
+            </TabsTrigger>
+            <TabsTrigger value="positive" className="gap-1.5 font-sans normal-case">
+              <ThumbsUp className="h-3.5 w-3.5" />
+              Positive
+              {positiveCount !== undefined && (
+                <span className="text-xs opacity-70">{positiveCount}</span>
+              )}
+            </TabsTrigger>
+            <TabsTrigger value="negative" className="gap-1.5 font-sans normal-case">
+              <ThumbsDown className="h-3.5 w-3.5" />
+              Negative
+              {negativeCount !== undefined && (
+                <span className="text-xs opacity-70">{negativeCount}</span>
+              )}
+            </TabsTrigger>
+          </TabsList>
+        </Tabs>
 
         <div className="flex items-center gap-2">
           <AgentFilter
@@ -234,12 +208,6 @@ export function FeedbackTable({
               }}
             />
           </div>
-
-          {hasActiveFilters && (
-            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
-              Clear
-            </Button>
-          )}
         </div>
       </div>
 
@@ -247,10 +215,11 @@ export function FeedbackTable({
         <TableHeader>
           <TableRow noHover>
             <TableHead className="w-[170px]">Created</TableHead>
-            <TableHead className="w-[130px]">Agent</TableHead>
             <TableHead className="w-[90px]">Type</TableHead>
             <TableHead>Feedback</TableHead>
+            <TableHead className="w-[130px]">Agent</TableHead>
             <TableHead className="w-[140px] text-right">View conversation</TableHead>
+            <TableHead className="w-[140px] text-right">Delete</TableHead>
           </TableRow>
         </TableHeader>
         <TableBody>
@@ -267,46 +236,52 @@ export function FeedbackTable({
               : `/${tenantId}/projects/${projectId}/traces/conversations/${item.conversationId}`;
             return (
               <TableRow key={item.id}>
-                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
+                <TableCell className="text-muted-foreground whitespace-nowrap">
                   {formatDateTimeTable(item.createdAt, { local: true })}
                 </TableCell>
-                <TableCell
-                  className="text-sm text-muted-foreground truncate max-w-[130px]"
-                  title={item.agentId ?? undefined}
-                >
-                  {item.agentId ? (
-                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.agentId}</code>
-                  ) : (
-                    <span className="text-muted-foreground/50">-</span>
-                  )}
-                </TableCell>
                 <TableCell className="whitespace-nowrap">
-                  <Badge variant={item.type === 'positive' ? 'default' : 'secondary'}>
+                  <Badge
+                    className="uppercase"
+                    variant={item.type === 'positive' ? 'primary' : 'error'}
+                  >
                     {item.type}
                   </Badge>
                 </TableCell>
                 <TableCell className="text-sm text-foreground whitespace-normal">
-                  {item.details ? truncate(String(item.details), 240) : '-'}
+                  {item.details ? (
+                    truncate(String(item.details), 240)
+                  ) : (
+                    <span className="text-muted-foreground/50">—</span>
+                  )}
+                </TableCell>
+                <TableCell className="max-w-[130px]" title={item.agentId ?? undefined}>
+                  {item.agentId ? (
+                    <Badge variant="code" className="text-xs truncate max-w-full inline-block">
+                      {item.agentId}
+                    </Badge>
+                  ) : (
+                    <span className="text-muted-foreground/50">—</span>
+                  )}
+                </TableCell>
+                <TableCell className="whitespace-nowrap text-right">
+                  <Link
+                    href={conversationHref}
+                    className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
+                    aria-label={item.messageId ? 'View message' : 'View conversation'}
+                  >
+                    <ArrowUpRight className="h-4 w-4" />
+                  </Link>
                 </TableCell>
                 <TableCell className="whitespace-nowrap text-right">
-                  <div className="flex items-center justify-end gap-1">
-                    <Link
-                      href={conversationHref}
-                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
-                      aria-label={item.messageId ? 'View message' : 'View conversation'}
-                    >
-                      <ArrowUpRight className="h-4 w-4" />
-                    </Link>
-                    <Button
-                      variant="ghost"
-                      size="icon"
-                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
-                      aria-label="Delete feedback"
-                      onClick={() => setDeleteFeedbackId(item.id)}
-                    >
-                      <Trash2 className="h-4 w-4" />
-                    </Button>
-                  </div>
+                  <Button
+                    variant="ghost"
+                    size="icon"
+                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
+                    aria-label="Delete feedback"
+                    onClick={() => setDeleteFeedbackId(item.id)}
+                  >
+                    <Trash2 className="h-4 w-4" />
+                  </Button>
                 </TableCell>
               </TableRow>
             );
@@ -329,7 +304,7 @@ export function FeedbackTable({
 
       <div className="flex items-center justify-between">
         <div className="text-xs text-muted-foreground">
-          Page {pagination.page} of {pagination.pages || 1} · {pagination.total} total
+          Page {pagination.page} of {pagination.pages || 1}
         </div>
 
         <div className="flex items-center gap-2">
diff --git a/agents-manage-ui/src/components/traces/filters/date-picker.tsx b/agents-manage-ui/src/components/traces/filters/date-picker.tsx
index ad1803e96..39c3d06eb 100644
--- a/agents-manage-ui/src/components/traces/filters/date-picker.tsx
+++ b/agents-manage-ui/src/components/traces/filters/date-picker.tsx
@@ -112,14 +112,15 @@ export function DatePickerWithPresets({
       {showCalendarDirectly ? (
         <PopoverTrigger asChild>
           <Button
-            variant="outline"
+            variant="gray-outline"
+            size="sm"
             disabled={disabled}
             className={cn(
-              'w-full justify-start text-left font-normal',
-              !dateComputations.dateFormattedValue && 'text-muted-foreground'
+              !dateComputations.dateFormattedValue && 'text-muted-foreground',
+              `flex items-center gap-2 w-full justify-start focus:ring-0 max-w-full min-w-0 text-left`
             )}
           >
-            <CalendarIcon className="mr-2 h-4 w-4" />
+            <CalendarIcon className="h-4 w-4 text-gray-400 dark:text-white/50" />
             {directTriggerLabel}
           </Button>
         </PopoverTrigger>
diff --git a/agents-ui-demo/package.json b/agents-ui-demo/package.json
index a900ef755..853601f6d 100644
--- a/agents-ui-demo/package.json
+++ b/agents-ui-demo/package.json
@@ -16,7 +16,7 @@
     "test": "echo 'No tests configured for chat-widget'"
   },
   "dependencies": {
-    "@inkeep/agents-ui": "^0.15.29",
+    "@inkeep/agents-ui": "^0.15.30",
     "react": "^19.1.1",
     "react-dom": "^19.1.1"
   },
```

## Changes Since Last Review

_N/A — local review (no prior GitHub review baseline)._

## Prior Feedback

> **IMPORTANT:** Local review mode does not load prior PR threads or prior review summaries. Treat this as a first-pass review of the current local changes unless the invoker provided additional context elsewhere.

### Automated Review Comments

_None (local review)._

### Human Review Comments

_None (local review)._

### Previous Review Summaries

_None (local review)._

### PR Discussion

_None (local review)._

## GitHub URL Base (for hyperlinks)

No GitHub PR context is available in local review mode.
- For in-repo citations, use repo-relative `path:line` or `path:start-end` references instead of GitHub blob URLs.
- External docs may still use standard markdown hyperlinks.
