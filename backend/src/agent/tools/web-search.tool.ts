import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import type { ConfigService } from '@nestjs/config';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Pure formatter — exported so it can be unit-tested independently. */
export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return 'No results found.';
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n');
}

async function callBrave(
  query: string,
  apiKey: string,
  siteRestrict?: string,
): Promise<SearchResult[]> {
  const q = siteRestrict ? `site:${siteRestrict} ${query}` : query;
  const params = new URLSearchParams({ q, count: '5' });
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    },
  );
  if (!res.ok) throw new Error(`Brave search failed: ${res.status}`);
  const data = (await res.json()) as {
    web?: {
      results?: Array<{ title: string; url: string; description: string }>;
    };
  };
  return (data.web?.results ?? []).slice(0, 5).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }));
}

async function callSerper(
  query: string,
  apiKey: string,
  siteRestrict?: string,
): Promise<SearchResult[]> {
  const q = siteRestrict ? `site:${siteRestrict} ${query}` : query;
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q, num: 5 }),
  });
  if (!res.ok) throw new Error(`Serper search failed: ${res.status}`);
  const data = (await res.json()) as {
    organic?: Array<{ title: string; link: string; snippet: string }>;
  };
  return (data.organic ?? []).slice(0, 5).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));
}

async function callGoogleCSE(
  query: string,
  apiKey: string,
  cseId: string,
  siteRestrict?: string,
): Promise<SearchResult[]> {
  const q = siteRestrict ? `site:${siteRestrict} ${query}` : query;
  const params = new URLSearchParams({ key: apiKey, cx: cseId, q, num: '5' });
  const res = await fetch(
    `https://www.googleapis.com/customsearch/v1?${params}`,
  );
  if (!res.ok) throw new Error(`Google CSE search failed: ${res.status}`);
  const data = (await res.json()) as {
    items?: Array<{ title: string; link: string; snippet: string }>;
  };
  return (data.items ?? []).slice(0, 5).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
  }));
}

export function createWebSearchTool(config: ConfigService): FunctionTool {
  const apiKey = config.get<string>('SEARCH_API_KEY', '');
  const provider = config.get<string>('SEARCH_PROVIDER', 'brave');
  const cseId = config.get<string>('GOOGLE_CSE_ID', '');

  return new FunctionTool({
    name: 'webSearch',
    description:
      'Search the web for current, real-time information: prices, local listings, news, job postings, or any live data. Use siteRestrict to scope results to a specific domain (e.g. "nairaland.com"). Returns a numbered list of results with clickable URLs.',
    parameters: z.object({
      query: z.string().describe('The search query'),
      siteRestrict: z
        .string()
        .optional()
        .describe(
          'Optional domain to restrict results to, e.g. "nairaland.com"',
        ),
    }),
    execute: async (args: Record<string, unknown>) => {
      const { query, siteRestrict } = args as {
        query: string;
        siteRestrict?: string;
      };
      if (!apiKey) {
        return { error: 'SEARCH_API_KEY is not configured' };
      }
      try {
        let results: SearchResult[];
        if (provider === 'serper') {
          results = await callSerper(query, apiKey, siteRestrict);
        } else if (provider === 'google-cse') {
          results = await callGoogleCSE(query, apiKey, cseId, siteRestrict);
        } else {
          results = await callBrave(query, apiKey, siteRestrict);
        }
        return { results, formatted: formatSearchResults(results) };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Search failed' };
      }
    },
  });
}
