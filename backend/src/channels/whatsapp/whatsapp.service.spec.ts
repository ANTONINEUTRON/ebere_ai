import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppBody, WhatsAppService } from './whatsapp.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-app-secret';

function makeBody(msg: Record<string, unknown>): WhatsAppBody {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              messages: [msg as never],
            },
          },
        ],
      },
    ],
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('WhatsAppService', () => {
  let service: WhatsAppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def = '') =>
              key === 'WHATSAPP_APP_SECRET' ? TEST_SECRET : def,
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  // ── 4.2 Verify — text message ────────────────────────────────────────────────

  describe('extractPayload — text', () => {
    it('extracts from phone and text.body from a text message', () => {
      const body = makeBody({
        from: '+2341234567890',
        id: 'msg-1',
        type: 'text',
        text: { body: 'Hello Ebere' },
      });

      const payload = service.extractPayload(body);

      expect(payload?.from).toBe('+2341234567890');
      expect(payload?.text).toBe('Hello Ebere');
      expect(payload?.mediaId).toBeUndefined();
    });
  });

  // ── 4.2 Verify — image message ───────────────────────────────────────────────

  describe('extractPayload — image', () => {
    it('extracts image.id as mediaId from an image message', () => {
      const body = makeBody({
        from: '+2341234567890',
        id: 'msg-2',
        type: 'image',
        image: { id: 'img-abc123', mime_type: 'image/jpeg' },
      });

      const payload = service.extractPayload(body);

      expect(payload?.from).toBe('+2341234567890');
      expect(payload?.mediaId).toBe('img-abc123');
      expect(payload?.mediaType).toBe('image');
    });
  });

  // ── extractPayload — audio ───────────────────────────────────────────────────

  describe('extractPayload — audio', () => {
    it('extracts audio.id as mediaId from an audio message', () => {
      const body = makeBody({
        from: '+2349876543210',
        id: 'msg-3',
        type: 'audio',
        audio: { id: 'aud-xyz789', mime_type: 'audio/ogg; codecs=opus' },
      });

      const payload = service.extractPayload(body);

      expect(payload?.mediaId).toBe('aud-xyz789');
      expect(payload?.mediaType).toBe('audio');
    });
  });

  // ── extractPayload — no messages (status event) ──────────────────────────────

  describe('extractPayload — status events', () => {
    it('returns null when there are no messages (e.g. delivery status update)', () => {
      const body: WhatsAppBody = {
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { messaging_product: 'whatsapp' } }] }],
      };

      expect(service.extractPayload(body)).toBeNull();
    });
  });

  // ── validateSignature ─────────────────────────────────────────────────────────

  describe('validateSignature', () => {
    it('returns true for a correctly signed payload', () => {
      const rawBody = Buffer.from('{"test":"data"}');
      const hmac = createHmac('sha256', TEST_SECRET)
        .update(rawBody)
        .digest('hex');
      expect(service.validateSignature(rawBody, `sha256=${hmac}`)).toBe(true);
    });

    it('returns false for a tampered signature', () => {
      const rawBody = Buffer.from('{"test":"data"}');
      expect(service.validateSignature(rawBody, 'sha256=badhash')).toBe(false);
    });

    it('returns false when the header is missing the sha256= prefix', () => {
      const rawBody = Buffer.from('{}');
      expect(service.validateSignature(rawBody, 'not-a-valid-header')).toBe(
        false,
      );
    });
  });
});
