import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { MemoryService } from '../../memory/memory.service';
import type { SafetyGuardService } from '../../safety/safety-guard.service';

type ToolContext = { userId?: string };

function guarded(
  guardService: SafetyGuardService,
  toolName: string,
  fn: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>,
) {
  return async (
    args: Record<string, unknown>,
    ctx?: ToolContext,
  ): Promise<unknown> => {
    const userId = ctx?.userId ?? '';
    const warning = await guardService.runPreHooks(toolName, args, userId);
    if (warning) return { warning };
    const result = await fn(args, ctx ?? {});
    await guardService.runPostHooks(toolName, result, userId);
    return result;
  };
}

export function createMemoryTools(
  memoryService: MemoryService,
  guardService: SafetyGuardService,
): FunctionTool[] {
  const saveRecord = new FunctionTool({
    name: 'saveRecord',
    description:
      "Save a record: 'ledger' (financial transaction), 'inventory' (stock item), or 'post' (community offer or need).",
    execute: guarded(guardService, 'saveRecord', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      const id = await memoryService.saveRecord(
        userId,
        args.type as string,
        args,
      );
      return { memoryId: id, message: 'Record saved successfully.' };
    }),
    parameters: z.object({
      type: z
        .string()
        .describe("Record type: 'ledger', 'inventory', or 'post'"),
      amount: z.number().optional().describe('Monetary amount'),
      quantity: z.number().optional().describe('Item count (inventory)'),
      date: z.string().optional().describe('ISO date string'),
      status: z
        .string()
        .optional()
        .describe("Status: 'active', 'fulfilled', 'expired', etc."),
      intent: z.string().optional().describe("Post intent: 'offer' or 'need'"),
      category: z
        .string()
        .optional()
        .describe('Category: healthcare, housing, home_services, food, etc.'),
      neighborhood: z.string().optional().describe('Location / neighborhood'),
      currency: z
        .string()
        .optional()
        .describe('Currency as mentioned by user (₦, $, naira, etc.)'),
      mediaFileId: z.string().optional().describe('Attached media file ID'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Additional structured fields'),
    }),
  });

  const searchRecords = new FunctionTool({
    name: 'searchRecords',
    description:
      'Search records. Posts search the community board (all users). Ledger/inventory search only the current user.',
    execute: guarded(guardService, 'searchRecords', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      const results = await memoryService.searchRecords(
        userId,
        args.type as string,
        {
          intent: args.intent as string | undefined,
          category: args.category as string | undefined,
          neighborhood: args.neighborhood as string | undefined,
          status: args.status as string | undefined,
          minAmount: args.minAmount as number | undefined,
          maxAmount: args.maxAmount as number | undefined,
        },
      );
      return {
        count: results.length,
        records: results.map((r) => ({
          id: String(r._id),
          type: r.type,
          intent: r.intent,
          category: r.category,
          neighborhood: r.neighborhood,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          metadata: r.metadata,
        })),
      };
    }),
    parameters: z.object({
      type: z
        .string()
        .describe("Record type to search: 'post', 'ledger', 'inventory'"),
      intent: z
        .string()
        .optional()
        .describe("Post intent filter: 'offer' or 'need'"),
      category: z.string().optional().describe('Category filter'),
      neighborhood: z.string().optional().describe('Neighborhood filter'),
      status: z
        .string()
        .optional()
        .describe('Status filter (defaults to active for posts)'),
      minAmount: z.number().optional().describe('Minimum amount'),
      maxAmount: z.number().optional().describe('Maximum amount'),
    }),
  });

  const updateRecord = new FunctionTool({
    name: 'updateRecord',
    description: 'Update an existing record. Only the owner can update.',
    execute: guarded(guardService, 'updateRecord', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      const updated = await memoryService.updateRecord(
        userId,
        args.memoryId as string,
        args.changes as Record<string, unknown>,
      );
      return updated
        ? { success: true }
        : { success: false, message: 'Record not found.' };
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the record to update'),
      changes: z
        .object({
          status: z.string().optional(),
          amount: z.number().optional(),
          quantity: z.number().optional(),
          currency: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .describe('Fields to update'),
    }),
  });

  const deleteRecord = new FunctionTool({
    name: 'deleteRecord',
    description: 'Permanently delete a record. Only the owner can delete.',
    execute: guarded(guardService, 'deleteRecord', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      await memoryService.deleteRecord(userId, args.memoryId as string);
      return { success: true };
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the record to delete'),
    }),
  });

  const getUserRecords = new FunctionTool({
    name: 'getUserRecords',
    description:
      "Get the current user's own records, optionally filtered by type and status.",
    execute: guarded(guardService, 'getUserRecords', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      const records = await memoryService.getUserRecords(
        userId,
        args.type as string | undefined,
        args.status as string | undefined,
      );
      return {
        count: records.length,
        records: records.map((r) => ({
          id: String(r._id),
          type: r.type,
          amount: r.amount,
          quantity: r.quantity,
          status: r.status,
          category: r.category,
          metadata: r.metadata,
        })),
      };
    }),
    parameters: z.object({
      type: z.string().optional().describe('Filter by record type'),
      status: z.string().optional().describe('Filter by status'),
    }),
  });

  const getFinancialReport = new FunctionTool({
    name: 'getFinancialReport',
    description:
      'Get a financial summary for today, this week, or this month. Only covers transactions logged with Ebere.',
    execute: guarded(guardService, 'getFinancialReport', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      const now = new Date();
      let from: Date;
      switch (args.period as string) {
        case 'today':
          from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          from = new Date(now.getTime() - 7 * 24 * 3_600_000);
          break;
        default: // month
          from = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      return memoryService.aggregateFinancials(userId, from, now);
    }),
    parameters: z.object({
      period: z
        .enum(['today', 'week', 'month'])
        .describe('Time period for the report'),
    }),
  });

  const getInventoryReport = new FunctionTool({
    name: 'getInventoryReport',
    description:
      'Get a snapshot of all active inventory items. Only covers items logged with Ebere.',
    execute: guarded(guardService, 'getInventoryReport', async (_args, ctx) => {
      const userId = ctx.userId ?? '';
      return memoryService.getInventorySnapshot(userId);
    }),
    parameters: z.object({}),
  });

  const expressInterest = new FunctionTool({
    name: 'expressInterest',
    description:
      'Express interest in a community post. The post owner will be notified.',
    execute: guarded(guardService, 'expressInterest', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      return memoryService.expressInterest(userId, args.memoryId as string);
    }),
    parameters: z.object({
      memoryId: z
        .string()
        .describe('ID of the community post to express interest in'),
    }),
  });

  const adjustStock = new FunctionTool({
    name: 'adjustStock',
    description:
      'Adjust inventory stock count. Automatically creates a ledger entry for sales and purchases.',
    execute: guarded(guardService, 'adjustStock', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      await memoryService.adjustStock(
        userId,
        args.memoryId as string,
        args.delta as number,
        args.reason as 'sale' | 'purchase' | 'adjustment',
      );
      return { success: true, message: `Stock adjusted by ${args.delta}.` };
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the inventory record'),
      delta: z
        .number()
        .describe('Units to add (positive) or remove (negative)'),
      reason: z
        .enum(['sale', 'purchase', 'adjustment'])
        .describe('Reason for the change'),
    }),
  });

  const listInterestedUsers = new FunctionTool({
    name: 'listInterestedUsers',
    description:
      'List people who have expressed interest in your post. Returns 2 at a time (paginated). Only the post owner can call this.',
    execute: guarded(guardService, 'listInterestedUsers', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      return memoryService.listInterestedUsers(
        userId,
        args.memoryId as string,
        (args.offset as number | undefined) ?? 0,
      );
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the post to review interest for'),
      offset: z
        .number()
        .optional()
        .describe('Pagination offset (default 0, increments of 2)'),
    }),
  });

  const approveContact = new FunctionTool({
    name: 'approveContact',
    description:
      "Approve contact exchange with an interested user. Both parties receive each other's contact details and the platform to use.",
    execute: guarded(guardService, 'approveContact', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      return memoryService.approveContact(
        userId,
        args.memoryId as string,
        args.interestedUserId as string,
      );
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the post'),
      interestedUserId: z.string().describe('User ID of the person to approve'),
    }),
  });

  const declineContact = new FunctionTool({
    name: 'declineContact',
    description:
      'Decline contact with an interested user. They are not notified. This hides them from future listInterestedUsers results.',
    execute: guarded(guardService, 'declineContact', async (args, ctx) => {
      const userId = ctx.userId ?? '';
      return memoryService.declineContact(
        userId,
        args.memoryId as string,
        args.interestedUserId as string,
      );
    }),
    parameters: z.object({
      memoryId: z.string().describe('ID of the post'),
      interestedUserId: z.string().describe('User ID of the person to decline'),
    }),
  });

  return [
    saveRecord,
    searchRecords,
    updateRecord,
    deleteRecord,
    getUserRecords,
    getFinancialReport,
    getInventoryReport,
    expressInterest,
    adjustStock,
    listInterestedUsers,
    approveContact,
    declineContact,
  ];
}
