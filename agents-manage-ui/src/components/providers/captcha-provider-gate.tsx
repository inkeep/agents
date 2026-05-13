'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { useRuntimeConfig } from '@/contexts/runtime-config';

const AUTH_PATHS = ['/login', '/forgot-password'];
const AUTH_PATH_PREFIXES = ['/accept-invitation/'];

function isAuthPath(pathname: string): boolean {
  if (AUTH_PATHS.includes(pathname)) return true;
  return AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldMountCaptcha(isCloud: boolean, siteKey: string, pathname: string): boolean {
  return isCloud && !!siteKey && isAuthPath(pathname);
}

export function CaptchaProviderGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const runtimeConfig = useRuntimeConfig();
  const siteKey = runtimeConfig.PUBLIC_INKEEP_RECAPTCHA_SITE_KEY;
  const isCloud = runtimeConfig.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';

  if (!shouldMountCaptcha(isCloud, siteKey, pathname)) {
    return <>{children}</>;
  }

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={siteKey}
      scriptProps={{ async: true, defer: true, appendTo: 'head' }}
    >
      {children}
      <p
        aria-hidden="true"
        className="fixed bottom-2 right-3 z-10 text-xs text-muted-foreground/60"
      >
        This site is protected by reCAPTCHA.
      </p>
    </GoogleReCaptchaProvider>
  );
}

// Safe wrapper around useGoogleReCaptcha. The library's default context (used
// when no GoogleReCaptchaProvider is mounted) returns `executeRecaptcha` as a
// function that throws — optional-chain calls do NOT short-circuit on it.
// Mirrors CaptchaProviderGate's mount conditions so that the returned value
// is undefined exactly when the provider was not mounted.
export function useCaptchaExecutor(): ((action: string) => Promise<string>) | undefined {
  const pathname = usePathname();
  const runtimeConfig = useRuntimeConfig();
  const siteKey = runtimeConfig.PUBLIC_INKEEP_RECAPTCHA_SITE_KEY;
  const isCloud = runtimeConfig.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  const { executeRecaptcha } = useGoogleReCaptcha();
  if (!shouldMountCaptcha(isCloud, siteKey, pathname)) return undefined;
  return executeRecaptcha;
}
