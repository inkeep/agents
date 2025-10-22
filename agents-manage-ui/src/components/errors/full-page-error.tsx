'use client';

import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { Button } from '@/components/ui/button';

function hasStatusCode(obj: unknown): obj is { status: number } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    typeof (obj as { status: unknown }).status === 'number'
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

export default function FullPageError({
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
    if (hasStatusCode(error.cause)) {
      statusCode = error.cause.status;
    } else if (hasStatusCode(error)) {
      statusCode = error.status;
    }
  }

  let title = propTitle;
  let description = propDescription;

  if (error && !title) {
    title = `Failed to load ${context}`;
    description = error.message || `An unexpected error occurred while loading this ${context}.`;

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
    } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
      title = 'Connection error';
      description = 'Unable to connect to the server. Please check your internet connection.';
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
    <BodyTemplate breadcrumbs={[{ label: statusCode ? `${statusCode} Error` : 'Error' }]}>
      <MainContent className="flex-1">
        <div className="flex flex-col items-center justify-center h-full gap-10 px-4">
          {statusCode ? (
            <div className="text-8xl font-mono font-bold text-foreground">{statusCode}</div>
          ) : (
            <AlertTriangle className="w-14 h-14 text-foreground" strokeWidth={1} />
          )}
          <div className="flex flex-col items-center gap-2 text-center max-w-md">
            <h1 className="text-lg text-muted-foreground font-mono uppercase">{title}</h1>
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
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
