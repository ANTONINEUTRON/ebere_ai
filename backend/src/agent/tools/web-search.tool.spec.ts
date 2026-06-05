import { formatSearchResults, SearchResult } from './web-search.tool';

describe('formatSearchResults', () => {
  it('formats a list of results as a numbered plain-text list', () => {
    const results: SearchResult[] = [
      {
        title: 'Solar Panel Vendors in Lagos',
        url: 'https://example.com/solar-lagos',
        snippet: 'Find top solar panel suppliers in Lagos, Nigeria.',
      },
      {
        title: 'Best Solar Panels Nigeria 2024',
        url: 'https://nairaland.com/solar',
        snippet: 'Community discussion on solar energy solutions.',
      },
    ];

    const output = formatSearchResults(results);

    expect(output).toBe(
      '1. Solar Panel Vendors in Lagos\nhttps://example.com/solar-lagos\nFind top solar panel suppliers in Lagos, Nigeria.\n\n' +
        '2. Best Solar Panels Nigeria 2024\nhttps://nairaland.com/solar\nCommunity discussion on solar energy solutions.',
    );
  });

  it('returns "No results found." for an empty array', () => {
    expect(formatSearchResults([])).toBe('No results found.');
  });

  it('puts the URL on its own line so messengers auto-preview it', () => {
    const results: SearchResult[] = [
      { title: 'Test', url: 'https://test.com', snippet: 'A snippet.' },
    ];
    const lines = formatSearchResults(results).split('\n');
    expect(lines[1]).toBe('https://test.com');
  });

  it('numbers results sequentially starting at 1', () => {
    const results: SearchResult[] = Array.from({ length: 5 }, (_, i) => ({
      title: `Result ${i + 1}`,
      url: `https://example.com/${i + 1}`,
      snippet: `Snippet ${i + 1}`,
    }));
    const output = formatSearchResults(results);
    for (let i = 1; i <= 5; i++) {
      expect(output).toContain(`${i}. Result ${i}`);
    }
  });
});
