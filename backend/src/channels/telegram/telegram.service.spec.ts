import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService, TelegramUpdate } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  // ── 4.1 Verify — photo update extracts largest file_id ──────────────────────

  describe('extractPayload — photo', () => {
    it('returns the file_id of the largest (last) photo size', () => {
      const update: TelegramUpdate = {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: 123456, type: 'private' },
          photo: [
            { file_id: 'small_id', file_unique_id: 'a', width: 90, height: 90 },
            {
              file_id: 'medium_id',
              file_unique_id: 'b',
              width: 320,
              height: 320,
            },
            {
              file_id: 'large_id',
              file_unique_id: 'c',
              width: 800,
              height: 800,
            },
          ],
        },
      };

      const payload = service.extractPayload(update);

      expect(payload?.fileId).toBe('large_id');
      expect(payload?.mediaType).toBe('photo');
      expect(payload?.chatId).toBe('123456');
    });

    it('handles a single-item photo array correctly', () => {
      const update: TelegramUpdate = {
        update_id: 2,
        message: {
          message_id: 2,
          chat: { id: 1, type: 'private' },
          photo: [
            {
              file_id: 'only_id',
              file_unique_id: 'x',
              width: 200,
              height: 200,
            },
          ],
        },
      };

      expect(service.extractPayload(update)?.fileId).toBe('only_id');
    });
  });

  // ── extractPayload — text ────────────────────────────────────────────────────

  describe('extractPayload — text', () => {
    it('returns chatId and text for a plain text message', () => {
      const update: TelegramUpdate = {
        update_id: 3,
        message: {
          message_id: 3,
          chat: { id: 789, type: 'private' },
          text: 'Hello Ebere',
        },
      };

      const payload = service.extractPayload(update);

      expect(payload?.chatId).toBe('789');
      expect(payload?.text).toBe('Hello Ebere');
      expect(payload?.fileId).toBeUndefined();
    });
  });

  // ── extractPayload — voice ───────────────────────────────────────────────────

  describe('extractPayload — voice', () => {
    it('extracts voice file_id and sets mediaType to voice', () => {
      const update: TelegramUpdate = {
        update_id: 4,
        message: {
          message_id: 4,
          chat: { id: 111, type: 'private' },
          voice: { file_id: 'voice_id', duration: 5 },
        },
      };

      const payload = service.extractPayload(update);

      expect(payload?.fileId).toBe('voice_id');
      expect(payload?.mediaType).toBe('voice');
    });
  });

  // ── extractPayload — unsupported ─────────────────────────────────────────────

  describe('extractPayload — unsupported types', () => {
    it('returns null when the message has no recognised content', () => {
      const update: TelegramUpdate = {
        update_id: 5,
        message: { message_id: 5, chat: { id: 1, type: 'private' } },
      };

      expect(service.extractPayload(update)).toBeNull();
    });

    it('returns null when the update has no message', () => {
      const update: TelegramUpdate = { update_id: 6 };
      expect(service.extractPayload(update)).toBeNull();
    });
  });
});
