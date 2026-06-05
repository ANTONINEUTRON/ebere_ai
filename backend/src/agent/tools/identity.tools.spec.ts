import { createIdentityTools } from './identity.tools';

function makeIdentityService(
  overrides: Partial<{
    generateLinkCode: jest.Mock;
    verifyLinkCode: jest.Mock;
  }> = {},
) {
  return {
    generateLinkCode: jest.fn().mockResolvedValue('ABC123'),
    verifyLinkCode: jest
      .fn()
      .mockResolvedValue({ _id: { toString: () => 'primary-user-id' } }),
    ...overrides,
  };
}

function makeUsersService(
  overrides: Partial<{
    addPendingIdentity: jest.Mock;
  }> = {},
) {
  return {
    addPendingIdentity: jest
      .fn()
      .mockResolvedValue({ _id: 'user-id', identities: [] }),
    ...overrides,
  };
}

describe('createIdentityTools', () => {
  describe('linkAccount', () => {
    it('returns a code and instructions', async () => {
      const identityService = makeIdentityService();
      const usersService = makeUsersService();
      const userId = 'user-abc';

      const [linkAccount] = createIdentityTools(
        identityService as never,
        usersService as never,
      ) as any[];
      const result = (await linkAccount.execute({}, { userId })) as Record<
        string,
        unknown
      >;

      expect(identityService.generateLinkCode).toHaveBeenCalledWith(
        userId,
        'telegram',
      );
      expect(result.code).toBe('ABC123');
      expect(result.expiresInMinutes).toBe(10);
      expect(typeof result.instructions).toBe('string');
    });

    it('returns error when no user context', async () => {
      const [linkAccount] = createIdentityTools(
        makeIdentityService() as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await linkAccount.execute({}, {})) as Record<
        string,
        unknown
      >;
      expect(result.error).toBeDefined();
    });

    it('returns error when generateLinkCode throws', async () => {
      const identityService = makeIdentityService({
        generateLinkCode: jest.fn().mockRejectedValue(new Error('DB error')),
      });
      const [linkAccount] = createIdentityTools(
        identityService as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await linkAccount.execute(
        {},
        { userId: 'u1' },
      )) as Record<string, unknown>;
      expect(result.error).toBe('DB error');
    });
  });

  describe('verifyLinkCode', () => {
    it('returns success and primary user id on valid code', async () => {
      const identityService = makeIdentityService();
      const [, verifyLinkCode] = createIdentityTools(
        identityService as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await verifyLinkCode.execute(
        { code: 'ABC123' },
        { userId: 'user-b' },
      )) as Record<string, unknown>;

      expect(identityService.verifyLinkCode).toHaveBeenCalledWith(
        'user-b',
        'ABC123',
      );
      expect(result.success).toBe(true);
      expect(result.primaryUserId).toBe('primary-user-id');
    });

    it('returns error when no user context', async () => {
      const [, verifyLinkCode] = createIdentityTools(
        makeIdentityService() as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await verifyLinkCode.execute(
        { code: 'X' },
        {},
      )) as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });

    it('returns error when verifyLinkCode throws (invalid/expired code)', async () => {
      const identityService = makeIdentityService({
        verifyLinkCode: jest
          .fn()
          .mockRejectedValue(new Error('Invalid or expired link code.')),
      });
      const [, verifyLinkCode] = createIdentityTools(
        identityService as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await verifyLinkCode.execute(
        { code: 'BAD99' },
        { userId: 'u2' },
      )) as Record<string, unknown>;
      expect(result.error).toBe('Invalid or expired link code.');
    });
  });

  describe('addIdentity', () => {
    it('calls addPendingIdentity with correct args', async () => {
      const usersService = makeUsersService();
      const [, , addIdentity] = createIdentityTools(
        makeIdentityService() as never,
        usersService as never,
      ) as any[];
      const result = (await addIdentity.execute(
        { provider: 'email', value: 'chidi@example.com' },
        { userId: 'user-c' },
      )) as Record<string, unknown>;

      expect(usersService.addPendingIdentity).toHaveBeenCalledWith(
        'user-c',
        'email',
        'chidi@example.com',
      );
      expect(result.success).toBe(true);
      expect(result.verified).toBe(false);
    });

    it('returns error when no user context', async () => {
      const [, , addIdentity] = createIdentityTools(
        makeIdentityService() as never,
        makeUsersService() as never,
      ) as any[];
      const result = (await addIdentity.execute(
        { provider: 'whatsapp', value: '+2348012345678' },
        {},
      )) as Record<string, unknown>;
      expect(result.error).toBeDefined();
    });

    it('returns error when user not found', async () => {
      const usersService = makeUsersService({
        addPendingIdentity: jest.fn().mockResolvedValue(null),
      });
      const [, , addIdentity] = createIdentityTools(
        makeIdentityService() as never,
        usersService as never,
      ) as any[];
      const result = (await addIdentity.execute(
        { provider: 'telegram', value: '@chidi' },
        { userId: 'ghost' },
      )) as Record<string, unknown>;
      expect(result.error).toBe('User not found');
    });
  });
});
