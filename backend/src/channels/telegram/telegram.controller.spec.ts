import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { IdentityService } from '../../identity/identity.service';
import { RunnerService } from '../../agent/runner.service';
import { MediaService } from '../../media/media.service';
import type { TelegramUpdate } from './telegram.service';

const EXPECTED_SECRET = 'test-webhook-secret-that-is-long-enough';

const minimalUpdate: TelegramUpdate = {
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: 123456, type: 'private' },
    text: 'Hello',
    from: { id: 111, is_bot: false, first_name: 'Test' },
  },
};

describe('TelegramController — webhook secret validation', () => {
  let controller: TelegramController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              if (key === 'TELEGRAM_WEBHOOK_SECRET') return EXPECTED_SECRET;
              return def ?? '';
            }),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            extractPayload: jest.fn().mockReturnValue({
              chatId: '123456',
              text: 'Hello',
            }),
            downloadFile: jest.fn(),
            sendMessage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: IdentityService,
          useValue: {
            resolveUser: jest.fn().mockResolvedValue({
              user: { _id: new Types.ObjectId() },
              suggestLinking: false,
            }),
          },
        },
        {
          provide: RunnerService,
          useValue: {
            run: jest.fn().mockResolvedValue('Hi there!'),
          },
        },
        {
          provide: MediaService,
          useValue: { store: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<TelegramController>(TelegramController);
  });

  it('processes the update when the correct secret is provided', async () => {
    await expect(
      controller.handleUpdate(EXPECTED_SECRET, minimalUpdate),
    ).resolves.not.toThrow();
  });

  it('throws ForbiddenException when the wrong secret is provided', async () => {
    await expect(
      controller.handleUpdate('wrong-secret', minimalUpdate),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the secret is an empty string', async () => {
    await expect(controller.handleUpdate('', minimalUpdate)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when the secret header is missing (undefined cast)', async () => {
    await expect(
      controller.handleUpdate(undefined as unknown as string, minimalUpdate),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when the secret is a valid string but different length', async () => {
    // timingSafeEqual also rejects on length mismatch before the comparison
    await expect(
      controller.handleUpdate(EXPECTED_SECRET + 'x', minimalUpdate),
    ).rejects.toThrow(ForbiddenException);
  });
});
