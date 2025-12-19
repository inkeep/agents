import { ErrorContent } from '@/components/errors/full-page-error';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen">
      <ErrorContent
        title="Page not found"
        description="The page you are looking for does not exist or has been moved."
        statusCode={404}
        showRetry={false}
      />
    </div>
  );
}
