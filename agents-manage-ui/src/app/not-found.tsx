import FullPageError from '@/components/errors/full-page-error';

export default function NotFound() {
  return (
    <FullPageError
      title="Page not found"
      description="The page you are looking for does not exist or has been moved."
      statusCode={404}
      showRetry={false}
    />
  );
}
