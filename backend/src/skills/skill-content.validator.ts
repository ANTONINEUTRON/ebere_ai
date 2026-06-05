import { BadRequestException } from '@nestjs/common';

const MAX_CHARS = 10_000;

const BLOCKED_STRINGS: string[] = [
  // Filesystem paths
  '../',
  './',
  '/etc/',
  '/var/',
  '/proc/',
  'C:\\',
  'D:\\',
  '%APPDATA%',
  '~/.',
  // Code / execution patterns
  'require(',
  'import(',
  'process.env',
  '__dirname',
  'eval(',
  'Function(',
  'exec(',
  'spawn(',
  // Internal network references
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.',
];

const BLOCKED_PATTERNS: RegExp[] = [
  /ignore.{0,20}system/i,
  /override.{0,20}instruction/i,
  /bypass.{0,20}prompt/i,
];

/**
 * Validates that skill content is safe to store and inject into the agent's context.
 * Throws `BadRequestException` with a human-readable reason on violation.
 */
export function validateSkillContent(content: string): void {
  if (content.length > MAX_CHARS) {
    throw new BadRequestException(
      'Skill is too long. Maximum is 10,000 characters.',
    );
  }

  for (const str of BLOCKED_STRINGS) {
    if (content.includes(str)) {
      throw new BadRequestException(
        'Skill content contains a disallowed pattern.',
      );
    }
  }

  for (const re of BLOCKED_PATTERNS) {
    if (re.test(content)) {
      throw new BadRequestException(
        'Skill content contains a disallowed instruction pattern.',
      );
    }
  }
}
