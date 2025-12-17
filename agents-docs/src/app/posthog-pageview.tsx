'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useEffect } from 'react';

export default function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url += `?${searchParams.toString()}`;
      }

      posthog.register_once({
        initial_referrer:
          typeof window !== 'undefined' ? document.referrer || '(direct)' : '(direct)',
        initial_landing_page: pathname,
      });

      const utmSource = searchParams?.get('utm_source');
      const utmMedium = searchParams?.get('utm_medium');
      const utmCampaign = searchParams?.get('utm_campaign');
      const utmContent = searchParams?.get('utm_content');
      const utmTerm = searchParams?.get('utm_term');

      if (utmSource || utmMedium || utmCampaign || utmContent || utmTerm) {
        const utmParams: Record<string, string> = {};
        if (utmSource) utmParams.utm_source = utmSource;
        if (utmMedium) utmParams.utm_medium = utmMedium;
        if (utmCampaign) utmParams.utm_campaign = utmCampaign;
        if (utmContent) utmParams.utm_content = utmContent;
        if (utmTerm) utmParams.utm_term = utmTerm;

        posthog.register_once(utmParams);
      }

      const clickIdParams: Record<string, string> = {};
      const gclid = searchParams?.get('gclid');
      const fbclid = searchParams?.get('fbclid');
      const msclkid = searchParams?.get('msclkid');
      const li_fat_id = searchParams?.get('li_fat_id');
      const ttclid = searchParams?.get('ttclid');

      if (gclid) clickIdParams.gclid = gclid;
      if (fbclid) clickIdParams.fbclid = fbclid;
      if (msclkid) clickIdParams.msclkid = msclkid;
      if (li_fat_id) clickIdParams.li_fat_id = li_fat_id;
      if (ttclid) clickIdParams.ttclid = ttclid;

      if (Object.keys(clickIdParams).length > 0) {
        posthog.register_once(clickIdParams);
      }

      posthog.capture('$pageview', {
        $current_url: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}
