import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { type ExternalToast, toast as sonnerToast } from 'sonner';

function ToastCopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="ml-auto shrink-0 p-1 rounded border border-border opacity-50 hover:opacity-100 hover:bg-muted/50 transition-all"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? (
        <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
      ) : (
        <Copy className="w-3 h-3 text-muted-foreground" />
      )}
      <span className="sr-only">{copied ? 'Copied' : 'Copy to clipboard'}</span>
    </button>
  );
}

function buildCopyText(type: string, message: string, options?: ExternalToast) {
  return [
    `${type}: ${message}`,
    options?.description ? String(options.description) : null,
    `Time: ${new Date().toLocaleString()}`,
    `Page: ${window.location.pathname}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function wrapToastMethod(
  method: (message: string | React.ReactNode, data?: ExternalToast) => string | number,
  type: string
) {
  return (message: string | React.ReactNode, options?: ExternalToast) => {
    return method(message, {
      ...options,
      action: options?.action ?? (
        <ToastCopyAction text={buildCopyText(type, String(message), options)} />
      ),
    });
  };
}

export const toast = Object.assign(wrapToastMethod(sonnerToast, 'Notice'), {
  error: wrapToastMethod(sonnerToast.error, 'Error'),
  success: wrapToastMethod(sonnerToast.success, 'Success'),
  info: wrapToastMethod(sonnerToast.info, 'Info'),
  warning: wrapToastMethod(sonnerToast.warning, 'Warning'),
  message: wrapToastMethod(sonnerToast.message, 'Notice'),
  custom: sonnerToast.custom,
  promise: sonnerToast.promise,
  loading: sonnerToast.loading,
  dismiss: sonnerToast.dismiss,
});
