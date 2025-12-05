'use client';

import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { Button } from '@/components/ui/button';

export default function FullPageError({ statusCode, ...props }: FullPageErrorProps) {
  return (
    <BodyTemplate breadcrumbs={[{ label: statusCode ? `${statusCode} Error` : 'Error' }]}>
      <MainContent className="flex-1">
        <ErrorContent statusCode={statusCode} {...props} />
      </MainContent>
    </BodyTemplate>
  );
}

function hasStatusCode(obj: unknown): obj is { status: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    typeof (obj as { status: unknown }).status === 'number'
  );
}

function isApiError(obj: unknown): obj is { status: number; error: { message: string } } {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const record = obj as Record<string, unknown>;

  return (
    'status' in record &&
    typeof record.status === 'number' &&
    'error' in record &&
    typeof record.error === 'object' &&
    record.error !== null &&
    'message' in (record.error as Record<string, unknown>) &&
    typeof (record.error as Record<string, unknown>).message === 'string'
  );
}

interface FullPageErrorProps {
  error?: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
  link?: string;
  linkText?: string;
  statusCode?: number;
  showRetry?: boolean;
  onRetry?: () => void;
  context?: string;
}

export function ErrorContent({
  error,
  reset,
  title: propTitle,
  description: propDescription,
  link,
  linkText,
  statusCode: propStatusCode,
  showRetry = true,
  onRetry,
  context = 'resource',
}: FullPageErrorProps) {
  let statusCode = propStatusCode;

  if (!statusCode && error) {
    if (isApiError(error)) {
      statusCode = error.status;
    } else if (hasStatusCode(error.cause)) {
      statusCode = error.cause.status;
    } else if (hasStatusCode(error)) {
      statusCode = error.status;
    }
  }

  let title = propTitle;
  let description = propDescription;

  if (error && !title) {
    title = `Failed to load ${context}`;
    description = isApiError(error)
      ? error.error.message
      : error.message || `An unexpected error occurred while loading this ${context}.`;

    if (statusCode === 404) {
      title = `${context.charAt(0).toUpperCase() + context.slice(1)} not found`;
      description = `The ${context} you are looking for does not exist or has been deleted.`;
    } else if (statusCode === 403) {
      title = 'Access denied';
      description = `You do not have permission to access this ${context}.`;
    } else if (statusCode === 401) {
      title = 'Authentication required';
      description = 'Please sign in to access this resource.';
    } else if (statusCode === 500) {
      title = 'Server error';
      description = 'An error occurred on the server. Please try again later.';
    } else if (statusCode === 503) {
      title = 'Service unavailable';
      description = 'The service is temporarily unavailable. Please try again in a few moments.';
    }
  }

  if (!title) {
    title = 'Something went wrong';
  }
  if (!description) {
    description = 'An unexpected error occurred. Please try again.';
  }

  const handleRetry = () => {
    if (reset) {
      reset();
    } else if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <main
      aria-labelledby="error-title"
      className="flex flex-col items-center justify-center h-full gap-10 px-4"
    >
      <h1 id="error-title" className="sr-only">
        {title}
      </h1>
      {statusCode ? (
        <div className="text-8xl font-mono font-bold text-foreground" aria-hidden="true">
          {statusCode}
        </div>
      ) : (
        <AlertTriangle className="w-14 h-14 text-foreground" strokeWidth={1} aria-hidden="true" />
      )}
      <div className="flex flex-col items-center gap-2 text-center max-w-md">
        <h2 className="text-lg text-muted-foreground font-mono uppercase">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex items-center gap-3">
        {showRetry && (
          <Button onClick={handleRetry} variant="outline">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
        )}
        {link && linkText && (
          <Button asChild variant="outline">
            <Link href={link} className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              {linkText}
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}
