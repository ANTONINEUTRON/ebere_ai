import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { User } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { LinkRequest } from './link-request.schema';
import { IdentityService } from './identity.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function execResolving(value: unknown) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRIMARY_ID = new Types.ObjectId();
const SECONDARY_ID = new Types.ObjectId();

const primaryUser = {
  _id: PRIMARY_ID,
  identities: [
    { provider: 'whatsapp', externalId: '+2341234', verified: false },
  ],
  plan: { tier: 'free' },
  profile: {},
};

const secondaryUser = {
  _id: SECONDARY_ID,
  identities: [
    { provider: 'telegram', externalId: '+2341234', verified: false },
  ],
  plan: { tier: 'free' },
  profile: {},
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('IdentityService', () => {
  let service: IdentityService;
  let userModel: {
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let linkRequestModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let mockUsersService: { upsertUser: jest.Mock };

  beforeEach(async () => {
    userModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    linkRequestModel = {
      create: jest.fn().mockResolvedValue({}),
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    mockUsersService = { upsertUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: getModelToken(LinkRequest.name),
          useValue: linkRequestModel,
        },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);
  });

  // ── 3.1 — resolveUser ───────────────────────────────────────────────────────

  describe('resolveUser', () => {
    it('creates a new user for an unknown identity; suggestLinking is false when no duplicate', async () => {
      mockUsersService.upsertUser.mockResolvedValue(primaryUser);
      userModel.findOne.mockReturnValue(execResolving(null)); // no duplicate

      const result = await service.resolveUser('whatsapp', '+2341234');

      expect(result.user._id).toEqual(PRIMARY_ID);
      expect(result.suggestLinking).toBe(false);
    });

    it('returns the same user on a repeat call; suggestLinking is true when a duplicate exists', async () => {
      // Telegram user resolves — but WhatsApp user with same phone already exists
      mockUsersService.upsertUser.mockResolvedValue(secondaryUser);
      userModel.findOne.mockReturnValue(execResolving(primaryUser));

      const result = await service.resolveUser('telegram', '+2341234');

      expect(result.user._id).toEqual(SECONDARY_ID);
      expect(result.suggestLinking).toBe(true);
    });
  });

  // ── 3.2 — verifyLinkCode ────────────────────────────────────────────────────

  describe('verifyLinkCode', () => {
    it('throws BadRequestException when the code is expired or invalid', async () => {
      linkRequestModel.findOne.mockReturnValue(execResolving(null));

      await expect(
        service.verifyLinkCode(SECONDARY_ID.toString(), 'BADCOD'),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls mergeAccounts and returns the primary user for a valid code', async () => {
      const linkReqId = new Types.ObjectId();
      linkRequestModel.findOne.mockReturnValue(
        execResolving({
          _id: linkReqId,
          fromUserId: PRIMARY_ID,
          code: 'ABC123',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );
      linkRequestModel.findByIdAndUpdate.mockReturnValue(execResolving({}));

      // mergeAccounts: findById(secondary), findById(primary); verifyLinkCode: findById(primary)
      userModel.findById
        .mockReturnValueOnce(execResolving(secondaryUser))
        .mockReturnValueOnce(execResolving(primaryUser))
        .mockReturnValueOnce(execResolving(primaryUser));
      userModel.findByIdAndUpdate.mockReturnValue(execResolving({}));

      const result = await service.verifyLinkCode(
        SECONDARY_ID.toString(),
        'ABC123',
      );

      expect(result._id).toEqual(PRIMARY_ID);
      // Both primary ($push) and secondary ($set identities: []) were updated
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });
  });

  // ── 3.3 — mergeAccounts ─────────────────────────────────────────────────────

  describe('mergeAccounts', () => {
    it('moves secondary identities to primary so getUserByIdentity resolves to primary', async () => {
      userModel.findById
        .mockReturnValueOnce(execResolving(secondaryUser)) // secondary lookup
        .mockReturnValueOnce(execResolving(primaryUser)); // primary lookup
      userModel.findByIdAndUpdate.mockReturnValue(execResolving({}));

      await service.mergeAccounts(
        PRIMARY_ID.toString(),
        SECONDARY_ID.toString(),
      );

      // Primary received secondary's identity via $push
      const pushCall = userModel.findByIdAndUpdate.mock.calls.find(
        ([, update]) => update.$push,
      );
      expect(pushCall).toBeDefined();
      expect(pushCall![1].$push.identities.$each[0].externalId).toBe(
        '+2341234',
      );

      // Secondary's identities were cleared and mergedInto was stamped
      const clearCall = userModel.findByIdAndUpdate.mock.calls.find(
        ([, update]) => Array.isArray(update.$set?.identities),
      );
      expect(clearCall).toBeDefined();
      expect(clearCall![1].$set.identities).toEqual([]);
      expect(clearCall![1].$set.mergedInto).toBeDefined();
    });
  });
});
