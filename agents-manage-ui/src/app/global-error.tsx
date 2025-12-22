'use client';

import NextError from 'next/error';
import { type FC, useEffect } from 'react';

const GlobalError: FC<{
  error: Error & { digest?: string };
}> = ({ error }) => {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true') {
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);
  // global-error must include html and body tags
  return (
    <html lang="en">
      <body>
        <NextError
          // `NextError` is the default Next.js error page component. Its type
          // definition requires a `statusCode` prop. However, since the App Router
          // does not expose status codes for errors, we simply pass 0 to render a
          // generic error message.
          statusCode={0}
        />
      </body>
    </html>
  );
};

export default GlobalError;
