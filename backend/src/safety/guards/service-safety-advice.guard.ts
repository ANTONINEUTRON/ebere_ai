import type { Guard } from '../guard.interface';

const SERVICE_CATEGORIES = new Set(['task', 'home_services']);

const SAFETY_ADVICE =
  'Safety reminder: Meet in a public place. Never pay upfront. Share your location with someone you trust.';

export const ServiceSafetyAdviceGuard: Guard = {
  name: 'ServiceSafetyAdviceGuard',
  async post(toolName, result, _userId) {
    if (toolName !== 'expressInterest') return;
    const r = result as Record<string, unknown>;
    if (SERVICE_CATEGORIES.has(String(r?.category ?? ''))) {
      r.safetyAdvice = SAFETY_ADVICE;
    }
  },
};
