import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { IdentityService } from '../../identity/identity.service';
import type { UsersService } from '../../users/users.service';

export function createIdentityTools(
  identityService: IdentityService,
  usersService: UsersService,
): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'linkAccount',
      description:
        'Generate a 6-character link code so the user can merge this account with another channel (e.g. link Telegram and WhatsApp). Return the code and tell the user to enter it on their other channel. The code expires in 10 minutes.',
      parameters: z.object({}),
      execute: async (
        _args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        try {
          const code = await identityService.generateLinkCode(
            userId,
            'telegram',
          );
          return {
            code,
            expiresInMinutes: 10,
            instructions: `On your other channel, send the message: "link code ${code}". The code expires in 10 minutes.`,
          };
        } catch (err: unknown) {
          return {
            error:
              err instanceof Error
                ? err.message
                : 'Failed to generate link code',
          };
        }
      },
    }),

    new FunctionTool({
      name: 'verifyLinkCode',
      description:
        'Verify a link code the user received on another channel to merge both accounts into one. All identities and history from both accounts are unified under one profile.',
      parameters: z.object({
        code: z
          .string()
          .describe('The 6-character code generated on the other account'),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const { code } = args as { code: string };
        try {
          const merged = await identityService.verifyLinkCode(userId, code);
          return {
            success: true,
            primaryUserId: merged._id.toString(),
            message:
              'Accounts merged successfully. All your identities and data are now unified.',
          };
        } catch (err: unknown) {
          return {
            error:
              err instanceof Error ? err.message : 'Failed to verify link code',
          };
        }
      },
    }),

    new FunctionTool({
      name: 'addIdentity',
      description:
        "Add a new contact identity (email address, WhatsApp number, or Telegram handle) to the user's account. The identity is added as pending verification. OTP confirmation will be required once that feature is live.",
      parameters: z.object({
        provider: z
          .enum(['telegram', 'whatsapp', 'email'])
          .describe('The channel type for the new identity'),
        value: z
          .string()
          .describe(
            'The contact value — phone number, email address, or Telegram username',
          ),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const { provider, value } = args as {
          provider: 'telegram' | 'whatsapp' | 'email';
          value: string;
        };
        try {
          const updated = await usersService.addPendingIdentity(
            userId,
            provider,
            value,
          );
          if (!updated) return { error: 'User not found' };
          return {
            success: true,
            provider,
            value,
            verified: false,
            message: `Added ${provider} identity "${value}". It will be verified via OTP once that feature is live.`,
          };
        } catch (err: unknown) {
          return {
            error:
              err instanceof Error ? err.message : 'Failed to add identity',
          };
        }
      },
    }),
  ];
}
