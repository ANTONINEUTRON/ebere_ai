import { Injectable } from '@nestjs/common';
import type { Guard } from './guard.interface';

@Injectable()
export class SafetyGuardService {
  private readonly guards: Guard[] = [];

  register(guard: Guard): void {
    this.guards.push(guard);
  }

  async runPreHooks(
    toolName: string,
    args: unknown,
    userId: string,
  ): Promise<string | void> {
    for (const guard of this.guards) {
      if (guard.pre) {
        const result = await guard.pre(toolName, args, userId);
        if (result) return result;
      }
    }
  }

  async runPostHooks(
    toolName: string,
    result: unknown,
    userId: string,
  ): Promise<void> {
    for (const guard of this.guards) {
      if (guard.post) {
        await guard.post(toolName, result, userId);
      }
    }
  }
}
