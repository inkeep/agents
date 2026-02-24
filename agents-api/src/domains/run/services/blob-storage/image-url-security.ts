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
import {
  blockedDisallowedPort,
  blockedEmbeddedCredentials,
  blockedUnsupportedScheme,
  blockedUrlResolvingToPrivateIp,
  invalidExternalImageUrl,
  noIpResolved,
  unableToResolveHost,
} from './image-security-errors';

const logger = getLogger('image-security');

export function validateExternalImageUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(invalidExternalImageUrl(rawUrl));
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(blockedUnsupportedScheme(protocol));
  }
  if (!ALLOWED_HTTP_PORTS.has(parsed.port)) {
    throw new Error(blockedDisallowedPort(parsed.port));
  }
  if (parsed.username || parsed.password) {
    throw new Error(blockedEmbeddedCredentials);
  }

  return parsed;
}

export async function validateUrlResolvesToPublicIp(url: URL): Promise<void> {
  const hostname = url.hostname;
  const candidateIps = await resolveCandidateIps(hostname);

  if (candidateIps.length === 0) {
    throw new Error(noIpResolved(hostname));
  }

  for (const ip of candidateIps) {
    if (isBlockedIpAddress(ip)) {
      logger.warn({ host: hostname, ip }, 'Blocked external image URL resolving to private IP');
      throw new Error(blockedUrlResolvingToPrivateIp(ip));
    }
  }
}

async function resolveCandidateIps(hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) {
    return [hostname];
  }

  try {
    return (await lookup(hostname, { all: true, verbatim: true })).map((result) => result.address);
  } catch (error) {
    logger.warn({ host: hostname, error }, 'DNS resolution failed for external image URL');
    throw new Error(unableToResolveHost(hostname));
  }
}

export function isBlockedIpAddress(ipAddress: string): boolean {
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
