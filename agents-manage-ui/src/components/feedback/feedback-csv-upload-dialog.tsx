'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  FileUp,
  Loader2,
  Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type BulkFeedbackResult, createFeedbackBulkAction } from '@/lib/actions/feedback';
import { type FeedbackCsvParseResult, parseFeedbackCsv } from '@/lib/csv/feedback-csv';

interface FeedbackCsvUploadDialogProps {
  tenantId: string;
  projectId: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

const PREVIEW_LIMIT = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const SAMPLE_CSV = `${Papa.unparse(
  [
    { conversationId: 'conv_abc123', type: 'positive', messageId: '', details: 'Great response!' },
    {
      conversationId: 'conv_def456',
      type: 'negative',
      messageId: 'msg_xyz789',
      details: 'Response was not relevant to my question',
    },
    { conversationId: 'conv_ghi012', type: 'positive', messageId: '', details: '' },
  ],
  { columns: ['conversationId', 'type', 'messageId', 'details'] }
)}\n`;

function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}\u2026`;
}

export function FeedbackCsvUploadDialog({
  tenantId,
  projectId,
  trigger,
  onSuccess,
}: FeedbackCsvUploadDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<FeedbackCsvParseResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<BulkFeedbackResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(null);
    setParseResult(null);
    setFileError(null);
    setUploadResult(null);
    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) reset();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError(null);
    setParseResult(null);
    setFileName(null);
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`
      );
      return;
    }
    try {
      const text = await file.text();
      const result = parseFeedbackCsv(text);
      setFileName(file.name);
      setParseResult(result);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to read the file');
    }
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feedback-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!parseResult || parseResult.items.length === 0) return;
    setIsUploading(true);
    setUploadResult(null);
    let result: Awaited<ReturnType<typeof createFeedbackBulkAction>> | undefined;
    let thrown: unknown;
    try {
      result = await createFeedbackBulkAction(tenantId, projectId, parseResult.items);
    } catch (err) {
      thrown = err;
    }
    setIsUploading(false);

    if (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : 'Failed to upload CSV');
      return;
    }
    if (!result?.success) {
      toast.error(result?.error || 'Failed to upload CSV');
      return;
    }

    if (!result.data) return;
    const data = result.data;
    setUploadResult(data);
    router.refresh();

    if (data.failed === 0) {
      toast.success(`Created ${data.created} feedback item${data.created === 1 ? '' : 's'}`);
      setIsOpen(false);
      reset();
      onSuccess?.();
    } else if (data.created > 0) {
      toast.warning(
        `Created ${data.created} item${data.created === 1 ? '' : 's'}, ${data.failed} failed`
      );
    } else {
      toast.error(`All ${data.failed} item${data.failed === 1 ? '' : 's'} failed to create`);
    }
  };

  const hasErrors = (parseResult?.errors.length ?? 0) > 0;
  const validCount = parseResult?.items.length ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Import feedback from CSV</DialogTitle>
          <DialogDescription>
            Provide a CSV file with columns <code className="text-xs">conversationId</code>{' '}
            (required), <code className="text-xs">type</code> (required:{' '}
            <code className="text-xs">positive</code> or <code className="text-xs">negative</code>
            ), and optionally <code className="text-xs">messageId</code> and{' '}
            <code className="text-xs">details</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          <Collapsible className="min-w-0">
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground group"
                >
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                  Show example
                </Button>
              </CollapsibleTrigger>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleDownloadSample}
              >
                <Download className="h-3.5 w-3.5" />
                Download sample
              </Button>
            </div>
            <CollapsibleContent className="pt-2 min-w-0">
              <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto whitespace-pre max-w-full">
                {SAMPLE_CSV}
              </pre>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label htmlFor="feedback-csv-file" className="text-sm font-medium">
              CSV file
            </Label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="feedback-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80 text-sm"
                disabled={isUploading}
              />
            </div>
            {fileName && !fileError && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileUp className="h-3 w-3" />
                {fileName}
              </p>
            )}
          </div>

          {fileError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {parseResult && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">
                  {validCount} valid {validCount === 1 ? 'row' : 'rows'}
                </span>
                {hasErrors && (
                  <span className="text-destructive font-medium">
                    {parseResult.errors.length}{' '}
                    {parseResult.errors.length === 1 ? 'error' : 'errors'}
                  </span>
                )}
                <span className="text-muted-foreground">
                  ({parseResult.totalRows} total {parseResult.totalRows === 1 ? 'row' : 'rows'})
                </span>
              </div>

              {hasErrors && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {parseResult.errors.slice(0, 20).map((err, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-mono">Row {err.rowNumber}:</span> {err.message}
                        </div>
                      ))}
                      {parseResult.errors.length > 20 && (
                        <div className="text-xs italic">
                          {`\u2026and ${parseResult.errors.length - 20} more`}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {validCount > 0 && (
                <div className="rounded-md border overflow-hidden">
                  <div className="p-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">
                    Preview ({Math.min(validCount, PREVIEW_LIMIT)} of {validCount})
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow noHover>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>Conversation ID</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead>Message ID</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseResult.items.slice(0, PREVIEW_LIMIT).map((item, idx) => (
                          <TableRow key={idx} noHover>
                            <TableCell className="text-muted-foreground font-mono text-xs">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="text-xs font-mono max-w-[200px] truncate">
                              {item.conversationId}
                            </TableCell>
                            <TableCell>
                              <Badge
                                className="uppercase text-xs"
                                variant={item.type === 'positive' ? 'primary' : 'error'}
                              >
                                {item.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono max-w-[150px] truncate">
                              {item.messageId || (
                                <span className="text-muted-foreground italic">{'\u2014'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">
                              {item.details ? (
                                truncate(item.details)
                              ) : (
                                <span className="text-muted-foreground italic">{'\u2014'}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}

          {uploadResult && (
            <div className="space-y-3">
              {uploadResult.created > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Successfully created {uploadResult.created} feedback
                    {uploadResult.created === 1 ? ' item' : ' items'}.
                  </AlertDescription>
                </Alert>
              )}
              {uploadResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      <div className="font-medium text-xs mb-1">
                        {uploadResult.failed} item{uploadResult.failed === 1 ? '' : 's'} failed:
                      </div>
                      {uploadResult.errors.slice(0, 20).map((err, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-mono">{err.conversationId}:</span> {err.message}
                        </div>
                      ))}
                      {uploadResult.errors.length > 20 && (
                        <div className="text-xs italic">
                          {`\u2026and ${uploadResult.errors.length - 20} more`}
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>
            {uploadResult ? 'Close' : 'Cancel'}
          </Button>
          {!uploadResult && (
            <Button
              onClick={handleUpload}
              disabled={isUploading || validCount === 0}
              title={
                validCount === 0 ? 'Choose a CSV with at least one valid row to upload' : undefined
              }
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {'Uploading\u2026'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload {validCount > 0 ? `${validCount} item${validCount === 1 ? '' : 's'}` : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
