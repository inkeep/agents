/**
 * URL and DNS guardrails for user-provided URLs.
 *
 * This prevents our server from being tricked into calling private/internal services
 * (for example localhost, metadata endpoints, or internal admin hosts).
 * Run these checks before any network request to an untrusted URL.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as ipaddr from 'ipaddr.js';
import { getLogger } from '../../../../logger';
import { ALLOWED_HTTP_PORTS } from './image-security-constants';

const logger = getLogger('image-security');

export function validateExternalImageUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid external image URL: ${rawUrl}`);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Blocked external image URL with unsupported scheme: ${protocol}`);
  }
  if (!ALLOWED_HTTP_PORTS.has(parsed.port)) {
    throw new Error(`Blocked external image URL with disallowed port: ${parsed.port}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Blocked external image URL with embedded credentials');
  }

  return parsed;
}

export async function validateUrlResolvesToPublicIp(url: URL): Promise<void> {
  const hostname = url.hostname;
  const candidateIps =
    isIP(hostname) === 0
      ? (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address)
      : [hostname];

  if (candidateIps.length === 0) {
    throw new Error(`No IP addresses resolved for host: ${hostname}`);
  }

  for (const ip of candidateIps) {
    if (isBlockedIpAddress(ip)) {
      logger.warn({ host: hostname, ip }, 'Blocked external image URL resolving to private IP');
      throw new Error(`Blocked external image URL resolving to private or reserved IP: ${ip}`);
    }
  }
}

function isBlockedIpAddress(ipAddress: string): boolean {
  if (ipaddr.IPv4.isValid(ipAddress)) {
    const parsed = ipaddr.IPv4.parse(ipAddress);
    const range = parsed.range();
    return (
      range === 'private' ||
      range === 'loopback' ||
      range === 'linkLocal' ||
      range === 'multicast' ||
      range === 'carrierGradeNat' ||
      range === 'reserved' ||
      range === 'unspecified' ||
      range === 'broadcast'
    );
  }

  if (ipaddr.IPv6.isValid(ipAddress)) {
    const parsed = ipaddr.IPv6.parse(ipAddress);
    const range = parsed.range();
    return (
      range === 'uniqueLocal' ||
      range === 'loopback' ||
      range === 'linkLocal' ||
      range === 'multicast' ||
      range === 'ipv4Mapped' ||
      range === 'rfc6145' ||
      range === 'rfc6052' ||
      range === '6to4' ||
      range === 'teredo' ||
      range === 'reserved' ||
      range === 'unspecified'
    );
  }

  return true;
}
