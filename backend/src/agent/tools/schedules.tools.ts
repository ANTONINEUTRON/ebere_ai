import { FunctionTool } from '@google/adk';
import type { BaseTool } from '@google/adk';
import { z } from 'zod';
import type { SchedulesService } from '../../schedules/schedules.service';

const taskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('web_search'),
    query: z.string().describe('Search query to run on the web'),
    siteRestrict: z
      .string()
      .optional()
      .describe('Restrict results to this domain (optional)'),
  }),
  z.object({
    type: z.literal('area_digest'),
    category: z
      .string()
      .optional()
      .describe('Post category to filter (e.g. "housing", "healthcare")'),
    neighborhood: z
      .string()
      .optional()
      .describe('Neighborhood or area to focus on'),
  }),
  z.object({
    type: z.literal('financial_report'),
    period: z.enum(['today', 'week', 'month']).describe('Reporting period'),
  }),
  z.object({
    type: z.literal('agent_query'),
    prompt: z
      .string()
      .describe('Full prompt for Ebere to execute as if the user said it'),
  }),
]);

export function createScheduleTools(
  schedulesService: SchedulesService,
): BaseTool[] {
  return [
    new FunctionTool({
      name: 'createSchedule',
      description:
        'Create a recurring scheduled task for the user. Convert the user\'s natural language schedule (e.g. "every Monday at 9am") to a cron expression before calling. See the Scheduling section of the system prompt for cron examples.',
      parameters: z.object({
        name: z
          .string()
          .describe(
            'Short label for this schedule (e.g. "Flutter job alerts")',
          ),
        cronExpression: z
          .string()
          .describe(
            'Standard 5-field cron expression (e.g. "0 9 * * 1" for Monday 9am)',
          ),
        task: taskSchema,
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const input = args as {
          name: string;
          cronExpression: string;
          task: unknown;
        };
        try {
          const schedule = await schedulesService.createSchedule(userId, {
            name: input.name,
            cronExpression: input.cronExpression,
            task: input.task as Parameters<
              typeof schedulesService.createSchedule
            >[1]['task'],
          });
          return {
            scheduleId: (
              schedule._id as unknown as { toString(): string }
            ).toString(),
            name: schedule.name,
            cronExpression: schedule.cronExpression,
            nextRunAt: schedule.nextRunAt.toISOString(),
            message: `Schedule "${schedule.name}" created. Next run: ${schedule.nextRunAt.toLocaleString()}.`,
          };
        } catch (err) {
          return {
            error: `Failed to create schedule: ${(err as Error).message}`,
          };
        }
      },
    }),

    new FunctionTool({
      name: 'listSchedules',
      description:
        "List all of the user's recurring schedules with their next run time.",
      parameters: z.object({}),
      execute: async (
        _args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        const schedules = await schedulesService.listSchedules(userId);
        if (!schedules.length)
          return { schedules: [], message: 'You have no recurring schedules.' };
        return {
          schedules: schedules.map((s) => ({
            id: (s._id as unknown as { toString(): string }).toString(),
            name: s.name,
            cronExpression: s.cronExpression,
            isActive: s.isActive,
            nextRunAt: s.nextRunAt.toLocaleString(),
            lastRunAt: s.lastRunAt?.toLocaleString() ?? 'Never',
            task: s.task,
          })),
        };
      },
    }),

    new FunctionTool({
      name: 'pauseSchedule',
      description:
        "Pause (deactivate) one of the user's recurring schedules so it no longer runs.",
      parameters: z.object({
        scheduleId: z.string().describe('ID of the schedule to pause'),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        try {
          await schedulesService.pauseSchedule(
            userId,
            args['scheduleId'] as string,
          );
          return { success: true, message: 'Schedule paused successfully.' };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    new FunctionTool({
      name: 'deleteSchedule',
      description: "Permanently delete one of the user's recurring schedules.",
      parameters: z.object({
        scheduleId: z.string().describe('ID of the schedule to delete'),
      }),
      execute: async (
        args: Record<string, unknown>,
        ctx?: { userId?: string },
      ) => {
        const userId = ctx?.userId;
        if (!userId) return { error: 'No user context available' };
        try {
          await schedulesService.deleteSchedule(
            userId,
            args['scheduleId'] as string,
          );
          return { success: true, message: 'Schedule deleted.' };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),
  ];
}
