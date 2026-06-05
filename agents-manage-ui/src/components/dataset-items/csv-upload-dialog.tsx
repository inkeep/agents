'use client';

import { AlertCircle, ChevronDown, Download, FileUp, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { createDatasetItemsBulkAction } from '@/lib/actions/dataset-items';
import { type CsvParseResult, parseDatasetItemsCsv } from '@/lib/csv/dataset-items-csv';

interface CsvUploadDialogProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

const PREVIEW_LIMIT = 10;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const SAMPLE_CSV = `${Papa.unparse(
  [
    { input: 'What is 2+2?', expectedOutput: '4' },
    { input: "What's the capital of France?", expectedOutput: 'Paris' },
    {
      input: JSON.stringify({
        messages: [
          { role: 'system', content: 'Be terse.' },
          { role: 'user', content: 'Ping' },
        ],
      }),
      expectedOutput: JSON.stringify([{ role: 'assistant', content: 'Pong' }]),
    },
  ],
  { columns: ['input', 'expectedOutput'] }
)}\n`;

function summarizeMessages(
  messages: { role: string; content: string | Record<string, unknown> }[]
): string {
  if (messages.length === 0) return '';
  const first = messages[0];
  const content = typeof first.content === 'string' ? first.content : JSON.stringify(first.content);
  const suffix = messages.length > 1 ? ` (+${messages.length - 1} more)` : '';
  const preview = content.length > 80 ? `${content.slice(0, 80)}\u2026` : content;
  return `${first.role}: ${preview}${suffix}`;
}

export function CsvUploadDialog({
  tenantId,
  projectId,
  datasetId,
  trigger,
  onSuccess,
}: CsvUploadDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CsvParseResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(null);
    setParseResult(null);
    setFileError(null);
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
      const result = parseDatasetItemsCsv(text);
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
    a.download = 'test-suite-items-sample.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUpload = async () => {
    if (!parseResult || parseResult.items.length === 0) return;
    setIsUploading(true);
    let result: Awaited<ReturnType<typeof createDatasetItemsBulkAction>> | undefined;
    let thrown: unknown;
    try {
      result = await createDatasetItemsBulkAction(
        tenantId,
        projectId,
        datasetId,
        parseResult.items.map((item) => ({
          input: item.input,
          expectedOutput: item.expectedOutput,
        }))
      );
    } catch (err) {
      thrown = err;
    }
    setIsUploading(false);

    if (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : 'Failed to upload CSV');
      return;
    }
    if (result?.success) {
      toast.success(`Created ${result.data?.created ?? parseResult.items.length} test suite items`);
      setIsOpen(false);
      reset();
      router.refresh();
      onSuccess?.();
      return;
    }
    toast.error(result?.error || 'Failed to upload CSV');
  };

  const hasErrors = (parseResult?.errors.length ?? 0) > 0;
  const validCount = parseResult?.items.length ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Upload test suite items from CSV</DialogTitle>
          <DialogDescription>
            Provide a CSV file with columns <code className="text-xs">input</code> (required) and{' '}
            <code className="text-xs">expectedOutput</code> (optional). Each cell may contain plain
            text (becomes a single-message turn) or JSON matching the item shape for multi-turn /
            non-text content.
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
            <Label htmlFor="csv-file" className="text-sm font-medium">
              CSV file
            </Label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="csv-file"
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
                          <TableHead>Input</TableHead>
                          <TableHead>Expected output</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseResult.items.slice(0, PREVIEW_LIMIT).map((item, idx) => (
                          <TableRow key={idx} noHover>
                            <TableCell className="text-muted-foreground font-mono text-xs">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="text-xs max-w-sm truncate">
                              {summarizeMessages(item.input.messages)}
                            </TableCell>
                            <TableCell className="text-xs max-w-sm truncate">
                              {item.expectedOutput ? (
                                summarizeMessages(item.expectedOutput)
                              ) : (
                                <span className="text-muted-foreground italic">—</span>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>
            Cancel
          </Button>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
