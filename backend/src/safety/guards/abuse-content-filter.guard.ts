import type { Guard } from '../guard.interface';

const BLOCKLIST = ['spam', 'scam', 'fraud', 'fake account', 'phishing'];

export const AbuseContentFilterGuard: Guard = {
  name: 'AbuseContentFilterGuard',
  async pre(_toolName, args) {
    const str = JSON.stringify(args).toLowerCase();
    for (const word of BLOCKLIST) {
      if (str.includes(word)) {
        return 'This request was blocked by the content filter. Please ensure your content follows community guidelines.';
      }
    }
  },
};
