import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './user.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function makeUser(profile: Record<string, unknown> = {}) {
  return {
    _id: USER_ID,
    identities: [{ provider: 'telegram', externalId: 'tg-1', verified: false }],
    plan: { tier: 'free', messageCount: 0 },
    profile,
  };
}

/** Returns a mock query object with a chainable .exec() */
function execResolving(value: unknown) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

/** Returns a mock query object with chainable .lean().exec() */
function leanExecResolving(value: unknown) {
  return { lean: jest.fn().mockReturnValue(execResolving(value)) };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let model: {
    findOne: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: model },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  // ── 2.2 Verify #1 ───────────────────────────────────────────────────────────

  describe('upsertUser', () => {
    it('returns the same _id when called twice with the same identity', async () => {
      const user = makeUser();

      // First call → upsert creates the user
      model.findOneAndUpdate.mockReturnValueOnce(execResolving(user));
      const first = await service.upsertUser('telegram', 'tg-1');

      // Second call → upsert finds the existing user (no insert, same doc)
      model.findOneAndUpdate.mockReturnValueOnce(execResolving(user));
      const second = await service.upsertUser('telegram', 'tg-1');

      expect(String(first._id)).toBe(String(second._id));
      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });
  });

  // ── 2.2 Verify #2 ───────────────────────────────────────────────────────────

  describe('mergeProfilePatch + getMissingCriticalFields', () => {
    it('sets profile.name and removes it from missing critical fields', async () => {
      const userWithName = makeUser({ name: 'Chidi' });

      // mergeProfilePatch writes profile.name
      model.findByIdAndUpdate.mockReturnValueOnce(execResolving(userWithName));
      await service.mergeProfilePatch(USER_ID, { name: 'Chidi' });

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        USER_ID,
        { $set: { 'profile.name': 'Chidi' } },
        { new: true },
      );

      // getMissingCriticalFields — name is set, neighborhood is still missing
      model.findById.mockReturnValueOnce(leanExecResolving(userWithName));
      const missing = await service.getMissingCriticalFields(USER_ID);

      expect(missing).not.toContain('name');
      expect(missing).toContain('neighborhood');
    });
  });

  // ── 2.2 Verify #3 ───────────────────────────────────────────────────────────

  describe('mergeProfilePatch — arbitrary fields', () => {
    it('stores occupation and regularMarket in profile without schema change', async () => {
      const patch = { occupation: 'driver', regularMarket: 'Mile 12' };
      const userWithExtras = makeUser(patch);

      model.findByIdAndUpdate.mockReturnValueOnce(
        execResolving(userWithExtras),
      );
      const updated = await service.mergeProfilePatch(USER_ID, patch);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        USER_ID,
        {
          $set: {
            'profile.occupation': 'driver',
            'profile.regularMarket': 'Mile 12',
          },
        },
        { new: true },
      );
      expect(updated?.profile['occupation']).toBe('driver');
      expect(updated?.profile['regularMarket']).toBe('Mile 12');
    });
  });
});
