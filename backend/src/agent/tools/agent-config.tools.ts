import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { UsersService } from '../../users/users.service';

/**
 * Two tools that let the agent personalise its name and tone per user.
 * `userId` is bound in the closure — it is never part of any Zod schema.
 */
export function createAgentConfigTools(
  usersService: UsersService,
  userId: string,
): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'setAgentName',
      description:
        "Change the name you go by for this user. Call this when the user says 'call yourself X', 'your name is X', or similar.",
      parameters: z.object({
        name: z
          .string()
          .describe(
            'The new name (3 to 30 characters, letters, numbers and spaces only)',
          ),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { name } = args as { name: string };
        try {
          const updated = await usersService.updateAgentConfig(userId, {
            agentName: name,
          });
          return {
            updated: true,
            agentName: updated.agentName,
            message: `Done — I'll go by ${updated.agentName} from now on.`,
          };
        } catch (err: unknown) {
          return { error: (err as Error).message };
        }
      },
    }),

    new FunctionTool({
      name: 'setAgentTone',
      description:
        'Change your communication style for this user. Call this when the user asks you to be more formal, casual, direct, concise, etc.',
      parameters: z.object({
        tone: z
          .string()
          .describe(
            "Description of the desired tone, e.g. 'warm', 'formal', 'direct', 'concise', 'sarcastic'",
          ),
      }),
      execute: async (args: Record<string, unknown>) => {
        const { tone } = args as { tone: string };
        try {
          const updated = await usersService.updateAgentConfig(userId, {
            agentTone: tone,
          });
          return {
            updated: true,
            agentTone: updated.agentTone,
            message: `Done — I'll communicate in a ${updated.agentTone} tone from now on.`,
          };
        } catch (err: unknown) {
          return { error: (err as Error).message };
        }
      },
    }),
  ];
}
