export function validateOrigin(
  origin: string | null | undefined,
  allowedDomains: string[]
): boolean {
  if (!origin || allowedDomains.length === 0) {
    return false;
  }

  let hostname: string;
  let host: string;
  try {
    const url = new URL(origin);
    hostname = url.hostname;
    host = url.host;
  } catch {
    return false;
  }

  for (const domain of allowedDomains) {
    if (domain === '*') {
      return true;
    }

    const domainHasPort = domain.includes(':') && !domain.startsWith('*');
    const target = domainHasPort ? host : hostname;

    if (domain.startsWith('*.')) {
      const suffix = domain.slice(2);
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
    } else if (target === domain) {
      return true;
    }
  }

  return false;
}
