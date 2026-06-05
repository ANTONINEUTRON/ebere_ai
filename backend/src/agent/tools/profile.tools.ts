import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { UsersService } from '../../users/users.service';

export function createProfileTools(usersService: UsersService): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'getUserProfile',
      description:
        "Retrieve the current user's profile blob, their verified channel identities, and a list of any missing critical onboarding fields (name, neighborhood). Call this at the start of each session.",
      parameters: z.object({}),
      execute: async (
        _args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };

        const [user, missingCriticalFields] = await Promise.all([
          usersService.getUserById(userId),
          usersService.getMissingCriticalFields(userId),
        ]);

        if (!user) return { error: 'User not found' };

        return {
          profile: user.profile ?? {},
          identities: user.identities.map((id) => ({
            provider: id.provider,
            verified: id.verified,
          })),
          missingCriticalFields,
        };
      },
    }),

    new FunctionTool({
      name: 'updateUserProfile',
      description:
        "Update the user's profile with any new information learned during the conversation (name, neighborhood, occupation, preferences, etc.). Call this whenever the user reveals something new about themselves.",
      parameters: z.object({
        patch: z
          .record(z.string(), z.unknown())
          .describe('Key-value pairs to merge into the profile blob'),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const patch = args['patch'] as Record<string, unknown>;
        const updated = await usersService.mergeProfilePatch(userId, patch);
        if (!updated) return { error: 'User not found' };
        return {
          profile: updated.profile,
          message: `Profile updated with: ${Object.keys(patch).join(', ')}.`,
        };
      },
    }),
  ];
}
