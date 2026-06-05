import { BadRequestException } from '@nestjs/common';

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

/**
 * Validates that a URL is safe to fetch (HTTPS, non-private destination).
 * Throws `BadRequestException` on violation.
 */
export function validatePublicUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Invalid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(
      'Only HTTPS URLs are allowed for skill import.',
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new BadRequestException('URL hostname is not allowed.');
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new BadRequestException(
        'URL resolves to a private or internal address.',
      );
    }
  }
}
