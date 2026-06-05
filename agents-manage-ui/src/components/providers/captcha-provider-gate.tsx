'use client';

import { usePathname } from 'next/navigation';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config';

interface GrecaptchaApi {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, opts: { action: string }) => Promise<string>;
}

function getGrecaptcha(): GrecaptchaApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { grecaptcha?: GrecaptchaApi }).grecaptcha;
}

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
  const mount = shouldMountCaptcha(isCloud, siteKey, pathname);

  return (
    <>
      {children}
      {mount && (
        <>
          <Script
            id="recaptcha-v3"
            strategy="afterInteractive"
            src={`https://www.google.com/recaptcha/api.js?render=${siteKey}`}
          />
          <p
            aria-hidden="true"
            className="fixed bottom-2 right-3 z-10 text-xs text-muted-foreground/60"
          >
            This site is protected by reCAPTCHA.
          </p>
        </>
      )}
    </>
  );
}

export function useCaptchaExecutor(): ((action: string) => Promise<string>) | undefined {
  const pathname = usePathname();
  const runtimeConfig = useRuntimeConfig();
  const siteKey = runtimeConfig.PUBLIC_INKEEP_RECAPTCHA_SITE_KEY;
  const isCloud = runtimeConfig.PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  if (!shouldMountCaptcha(isCloud, siteKey, pathname)) return undefined;
  return (action: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const grecaptcha = getGrecaptcha();
      if (!grecaptcha) {
        reject(new Error('reCAPTCHA library not loaded'));
        return;
      }
      grecaptcha.ready(() => {
        grecaptcha.execute(siteKey, { action }).then(resolve).catch(reject);
      });
    });
}
