import { BadRequestException } from '@nestjs/common';
import { validatePublicUrl } from './ssrf.validator';

describe('validatePublicUrl', () => {
  // ── Happy path ─────────────────────────────────────────────────────────────

  it('accepts a valid public HTTPS URL', () => {
    expect(() =>
      validatePublicUrl('https://example.com/skill.md'),
    ).not.toThrow();
  });

  it('accepts a HTTPS URL with path and query', () => {
    expect(() =>
      validatePublicUrl(
        'https://raw.githubusercontent.com/user/repo/main/skill.md',
      ),
    ).not.toThrow();
  });

  // ── Protocol ───────────────────────────────────────────────────────────────

  it('throws BadRequestException for plain HTTP', () => {
    expect(() => validatePublicUrl('http://example.com/skill.md')).toThrow(
      BadRequestException,
    );
    expect(() => validatePublicUrl('http://example.com/skill.md')).toThrow(
      'HTTPS',
    );
  });

  it('throws BadRequestException for ftp URL', () => {
    expect(() => validatePublicUrl('ftp://example.com/file')).toThrow(
      BadRequestException,
    );
  });

  // ── Malformed URLs ─────────────────────────────────────────────────────────

  it('throws BadRequestException for a non-URL string', () => {
    expect(() => validatePublicUrl('not-a-url')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for empty string', () => {
    expect(() => validatePublicUrl('')).toThrow(BadRequestException);
  });

  // ── Private / internal IP ranges ──────────────────────────────────────────

  describe('private IP ranges', () => {
    it.each([
      ['https://127.0.0.1/skill', '127.x loopback'],
      ['https://127.0.0.2/skill', '127.x range'],
      ['https://10.0.0.1/skill', '10.x RFC-1918'],
      ['https://10.255.255.255/skill', '10.x upper bound'],
      ['https://172.16.0.1/skill', '172.16 RFC-1918'],
      ['https://172.31.255.255/skill', '172.31 upper bound'],
      ['https://172.20.1.1/skill', '172.20 mid-range'],
      ['https://192.168.1.1/skill', '192.168 RFC-1918'],
      ['https://192.168.0.0/skill', '192.168 lower bound'],
      ['https://169.254.169.254/skill', 'link-local / cloud metadata'],
      ['https://0.0.0.0/skill', '0.0.0.0'],
      ['https://localhost/skill', 'localhost hostname'],
    ])('blocks %s (%s)', (url) => {
      expect(() => validatePublicUrl(url)).toThrow(BadRequestException);
    });
  });

  // ── Edge cases just outside private ranges ────────────────────────────────

  it('allows 172.15.x.x (just below private range)', () => {
    expect(() => validatePublicUrl('https://172.15.1.1/skill')).not.toThrow();
  });

  it('allows 172.32.x.x (just above private range)', () => {
    expect(() => validatePublicUrl('https://172.32.1.1/skill')).not.toThrow();
  });
});
