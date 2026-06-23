import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Gemini SDK before importing the module under test.
// GoogleGenerativeAI is used with `new`, so the mock implementation
// must be a regular function (not an arrow function) to be constructable.
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(function () {
  return { generateContent: mockGenerateContent };
});

// Use a plain constructor-compatible class for the mock
vi.mock('@google/generative-ai', () => {
  function FakeGoogleGenerativeAI() {
    return { getGenerativeModel: mockGetGenerativeModel };
  }
  return { GoogleGenerativeAI: FakeGoogleGenerativeAI };
});

const { generateTerms } = await import('./stock-terms.js');

describe('generateTerms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed terms on successful API call', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(['ai technology', 'neural network', 'machine learning', 'data science', 'future tech']),
      },
    });

    const terms = await generateTerms('AI Technology', 'Artificial intelligence is changing the world...');
    expect(terms).toEqual(['ai technology', 'neural network', 'machine learning', 'data science', 'future tech']);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('strips markdown code fences before parsing', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => '```json\n["ai technology", "neural network"]\n```',
      },
    });

    const terms = await generateTerms('AI', 'Some script');
    expect(terms).toEqual(['ai technology', 'neural network']);
  });

  it('retries on JSON parse failure and eventually succeeds', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { text: () => 'not json at all' },
      })
      .mockResolvedValueOnce({
        response: { text: () => 'still not json' },
      })
      .mockResolvedValueOnce({
        response: { text: () => '["term one", "term two", "term three"]' },
      });

    const terms = await generateTerms('Test', 'Script content', { amount: 3 });
    expect(terms).toEqual(['term one', 'term two', 'term three']);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('falls back to regex extraction when LLM wraps JSON in prose', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Here are your search terms:\n["ai robot", "future city"]\nEnjoy!',
      },
    });

    const terms = await generateTerms('Future', 'Script', { amount: 2 });
    expect(terms).toEqual(['ai robot', 'future city']);
  });

  it('returns empty array after exhausting retries', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'completely invalid response with no array anywhere',
      },
    });

    const terms = await generateTerms('Broken', 'Test');
    expect(terms).toEqual([]);
    expect(mockGenerateContent).toHaveBeenCalledTimes(5); // MAX_RETRIES
  });

  it('rejects non-string array elements and retries', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { text: () => '["valid term", 42, "another term"]' },
      })
      .mockResolvedValueOnce({
        response: { text: () => JSON.stringify(['valid term', 'another valid term']) },
      });

    const terms = await generateTerms('Validation', 'Test', { amount: 3 });
    expect(terms).toEqual(['valid term', 'another valid term']);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('includes matchScriptOrder instructions when true', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(['opening shot', 'middle scene', 'closing shot']),
      },
    });

    const terms = await generateTerms('Story', 'Beginning Middle End', {
      amount: 3,
      matchScriptOrder: true,
    });

    expect(terms).toEqual(['opening shot', 'middle scene', 'closing shot']);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const promptText = callArgs.map(p => p.text).join(' ');
    expect(promptText).toContain('chronological');
    expect(promptText).toContain('same order');
  });

  it('clamps amount to 1-10 range', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(['a', 'b']),
      },
    });

    const terms0 = await generateTerms('x', 'y', { amount: 0 });
    expect(terms0).toEqual(['a', 'b']);

    vi.clearAllMocks();
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
      },
    });

    const terms15 = await generateTerms('x', 'y', { amount: 15 });
    expect(terms15).toHaveLength(10);
  });

  it('generates correct number of example terms for matchScriptOrder', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(['a', 'b', 'c', 'd', 'e']),
      },
    });

    const terms = await generateTerms('x', 'y', { amount: 5, matchScriptOrder: true });
    expect(terms).toHaveLength(5);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const promptText = callArgs.map(p => p.text).join(' ');
    expect(promptText).toContain('"final visual topic"');
  });
});
