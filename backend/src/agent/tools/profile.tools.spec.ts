import { Types } from 'mongoose';
import { createProfileTools } from './profile.tools';

const makeId = () => new Types.ObjectId().toString();

function makeUsersService(
  overrides: Partial<{
    getUserById: jest.Mock;
    getMissingCriticalFields: jest.Mock;
    mergeProfilePatch: jest.Mock;
  }> = {},
) {
  return {
    getUserById: jest.fn().mockResolvedValue(null),
    getMissingCriticalFields: jest.fn().mockResolvedValue([]),
    mergeProfilePatch: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('createProfileTools', () => {
  describe('getUserProfile', () => {
    it('returns empty profile and missing critical fields for a new user', async () => {
      const userId = makeId();
      const usersService = makeUsersService({
        getUserById: jest.fn().mockResolvedValue({
          profile: {},
          identities: [],
        }),
        getMissingCriticalFields: jest
          .fn()
          .mockResolvedValue(['name', 'neighborhood']),
      });

      const [getUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      const result = (await getUserProfile.execute({}, { userId })) as Record<
        string,
        unknown
      >;

      expect(result.profile).toEqual({});
      expect(result.missingCriticalFields).toEqual(['name', 'neighborhood']);
      expect(result.identities).toEqual([]);
    });

    it('returns populated profile and no missing fields for returning user', async () => {
      const userId = makeId();
      const usersService = makeUsersService({
        getUserById: jest.fn().mockResolvedValue({
          profile: { name: 'Chidi', neighborhood: 'Ikeja' },
          identities: [{ provider: 'telegram', verified: true }],
        }),
        getMissingCriticalFields: jest.fn().mockResolvedValue([]),
      });

      const [getUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      const result = (await getUserProfile.execute({}, { userId })) as Record<
        string,
        unknown
      >;

      expect((result.profile as Record<string, unknown>)['name']).toBe('Chidi');
      expect(result.missingCriticalFields).toEqual([]);
      expect((result.identities as unknown[]).length).toBe(1);
    });

    it('returns error when no user context', async () => {
      const usersService = makeUsersService();
      const [getUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      const result = (await getUserProfile.execute({}, {})) as Record<
        string,
        unknown
      >;
      expect(result.error).toBeDefined();
    });
  });

  describe('updateUserProfile', () => {
    it('calls mergeProfilePatch with the provided patch', async () => {
      const userId = makeId();
      const patch = { name: 'Chidi' };
      const usersService = makeUsersService({
        mergeProfilePatch: jest.fn().mockResolvedValue({
          profile: { name: 'Chidi' },
        }),
      });

      const [, updateUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      await updateUserProfile.execute({ patch }, { userId });

      expect(usersService.mergeProfilePatch).toHaveBeenCalledWith(
        userId,
        patch,
      );
    });

    it('stores arbitrary profile fields without schema changes', async () => {
      const userId = makeId();
      const patch = { regularMarket: 'Mile 12', occupation: 'trader' };
      const usersService = makeUsersService({
        mergeProfilePatch: jest.fn().mockResolvedValue({
          profile: { regularMarket: 'Mile 12', occupation: 'trader' },
        }),
      });

      const [, updateUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      const result = (await updateUserProfile.execute(
        { patch },
        { userId },
      )) as Record<string, unknown>;

      expect(usersService.mergeProfilePatch).toHaveBeenCalledWith(
        userId,
        patch,
      );
      expect((result.profile as Record<string, unknown>)['regularMarket']).toBe(
        'Mile 12',
      );
    });

    it('returns error when no user context', async () => {
      const usersService = makeUsersService();
      const [, updateUserProfile] = createProfileTools(
        usersService as never,
      ) as any[];
      const result = (await updateUserProfile.execute(
        { patch: { name: 'X' } },
        {},
      )) as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });
  });
});
