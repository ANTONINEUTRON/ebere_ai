import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { NotificationsService } from '../../notifications/notifications.service';

export function createNotificationsTools(
  notificationsService: NotificationsService,
): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'setReminder',
      description:
        'Set a one-time reminder for the user at a specific future date and time. Use this for one-off events ("remind me at 3pm today", "remind me tomorrow morning"). For recurring tasks, use createSchedule instead.',
      parameters: z.object({
        message: z
          .string()
          .describe('The reminder message to deliver to the user'),
        triggerAt: z
          .string()
          .describe(
            'ISO 8601 datetime string for when to fire the reminder (e.g. "2026-05-24T09:00:00Z")',
          ),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const triggerAt = new Date(args['triggerAt'] as string);
        if (isNaN(triggerAt.getTime())) {
          return {
            error: 'Invalid triggerAt date — provide an ISO 8601 string.',
          };
        }
        if (triggerAt <= new Date()) {
          return { error: 'triggerAt must be in the future.' };
        }
        try {
          const reminderId = await notificationsService.createReminder(
            userId,
            args['message'] as string,
            triggerAt,
          );
          return {
            reminderId,
            triggerAt: triggerAt.toISOString(),
            message: `Reminder set for ${triggerAt.toLocaleString()}.`,
          };
        } catch (err) {
          return { error: `Failed to set reminder: ${(err as Error).message}` };
        }
      },
    }),
  ];
}
