import { ForbiddenException } from '@nestjs/common';
import type { Guard } from '../guard.interface';

const FINANCIAL_TOOLS = new Set(['getFinancialReport']);

export const FinancialPrivacyGuard: Guard = {
  name: 'FinancialPrivacyGuard',
  async pre(toolName, args, userId) {
    const isLedgerSave =
      toolName === 'saveRecord' &&
      (args as Record<string, unknown>).type === 'ledger';
    if (!FINANCIAL_TOOLS.has(toolName) && !isLedgerSave) return;

    const argsObj = args as Record<string, unknown>;
    if (argsObj.userId && argsObj.userId !== userId) {
      throw new ForbiddenException(
        'Access to financial records of another user is not allowed',
      );
    }
  },
};
