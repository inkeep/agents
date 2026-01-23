'use client';

import { AlertTriangle, ArrowLeft, type LucideIcon, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { buildLoginUrlWithCurrentPath } from '@/lib/utils/auth-redirect';
import { getStatusCodeFromErrorCode } from '@/lib/utils/error-serialization';

export default function FullPageError(props: FullPageErrorProps) {
  const resolvedStatusCode = getStatusCodeFromErrorCode(props.errorCode);
  return <ErrorContent statusCode={resolvedStatusCode} {...props} />;
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

const STATUS_CODE_ERROR_MAP: Record<number, string> = {
  404: 'not_found',
  403: 'forbidden',
  401: 'unauthorized',
  500: 'internal_server_error',
  503: 'service_unavailable',
  400: 'bad_request',
  422: 'unprocessable_entity',
};

function getErrorCodeFromStatusCode(statusCode?: number): string | undefined {
  if (!statusCode) return undefined;
  return STATUS_CODE_ERROR_MAP[statusCode];
}

function getErrorMessage(
  errorCode: string | undefined,
  context: string
): { title: string; description: string } {
  const contextCapitalized = context.charAt(0).toUpperCase() + context.slice(1);

  switch (errorCode) {
    case 'not_found':
      return {
        title: `${contextCapitalized} not found`,
        description: `The ${context} you are looking for does not exist or has been deleted.`,
      };
    case 'forbidden':
      return {
        title: 'Access denied',
        description: `You do not have permission to access this ${context}.`,
      };
    case 'unauthorized':
      return {
        title: 'Authentication required',
        description: 'Please sign in to access this resource.',
      };
    case 'internal_server_error':
      return {
        title: 'Server error',
        description: 'An error occurred on the server. Please try again later.',
      };
    case 'service_unavailable':
      return {
        title: 'Service unavailable',
        description: 'The service is temporarily unavailable. Please try again in a few moments.',
      };
    case 'bad_request':
    case 'validation_error':
    case 'unprocessable_entity':
      return {
        title: 'Invalid request',
        description: `The request to load this ${context} was invalid. Please try again.`,
      };
    default:
      return {
        title: `Failed to load ${context}`,
        description: `An unexpected error occurred while loading this ${context}.`,
      };
  }
}

interface FullPageErrorProps {
  error?: Error & { digest?: string };
  errorCode?: string;
  reset?: () => void;
  title?: string;
  description?: React.ReactNode;
  link?: string;
  linkText?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  context?: string;
  icon?: LucideIcon;
}

export function ErrorContent({
  error,
  errorCode: propErrorCode,
  icon: Icon = AlertTriangle,
  reset,
  title: propTitle,
  description: propDescription,
  link,
  linkText,
  statusCode: propStatusCode,
  showRetry = true,
  onRetry,
  context = 'resource',
}: FullPageErrorProps & {
  statusCode?: number;
}) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Resolve error code from props or error object
  let errorCode = propErrorCode;
  let statusCode = propStatusCode;

  if (!errorCode && !statusCode && error) {
    if (isApiError(error)) {
      statusCode = error.status;
    } else if (hasStatusCode(error.cause)) {
      statusCode = error.cause.status;
    } else if (hasStatusCode(error)) {
      statusCode = error.status;
    }
  }

  // Convert between error code and status code as needed
  if (errorCode && !statusCode) {
    statusCode = getStatusCodeFromErrorCode(errorCode);
  } else if (statusCode && !errorCode) {
    errorCode = getErrorCodeFromStatusCode(statusCode);
  }

  // Handle 401 unauthorized errors by redirecting to login
  useEffect(() => {
    if ((statusCode === 401 || errorCode === 'unauthorized') && !isRedirecting) {
      setIsRedirecting(true);
      const loginUrl = buildLoginUrlWithCurrentPath();
      router.push(loginUrl);
    }
  }, [statusCode, errorCode, router, isRedirecting]);

  // Generate title and description
  let title = propTitle;
  let description = propDescription;

  if (!title) {
    const errorMessages = getErrorMessage(errorCode, context);
    title = errorMessages.title;
    if (!description) {
      description = errorMessages.description;
    }
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

  // Show redirecting message for 401 errors
  if (isRedirecting && (statusCode === 401 || errorCode === 'unauthorized')) {
    return (
      <main
        aria-labelledby="redirect-title"
        className="flex flex-col items-center justify-center h-full gap-10 px-4"
      >
        <h1 id="redirect-title" className="sr-only">
          Redirecting to login
        </h1>
        <div className="text-muted-foreground text-sm">Redirecting to login...</div>
      </main>
    );
  }

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
        <Icon className="w-14 h-14 text-foreground" strokeWidth={1} aria-hidden="true" />
      )}
      <div className="flex flex-col items-center gap-2 text-center max-w-md">
        <h2 className="text-lg text-muted-foreground font-mono uppercase">{title}</h2>
        <div className="text-muted-foreground text-sm">{description}</div>
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
