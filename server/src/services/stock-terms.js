import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MAX_RETRIES = 5;

/**
 * Strip markdown code fences from a response string.
 * Handles ```json ... ```, ``` ... ```, and stray backticks.
 */
function stripCodeFence(text) {
  let t = (text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '');
    t = t.replace(/\s*```$/, '');
  }
  return t.trim();
}

/**
 * Generate stock-video search terms from a video subject and script.
 *
 * @param {string} videoSubject - The topic / title of the video
 * @param {string} videoScript - The full generated script text
 * @param {Object} [options]
 * @param {number} [options.amount=5] - How many terms to generate (5-10)
 * @param {boolean} [options.matchScriptOrder=false] - If true, terms follow script chronology
 * @returns {Promise<string[]>} Array of search term strings (1-3 words each)
 */
export async function generateTerms(videoSubject, videoScript, options = {}) {
  const amount = Math.min(Math.max(options.amount || 5, 1), 10);
  const matchScriptOrder = options.matchScriptOrder === true;

  let goal, orderingRule, outputExample;

  if (matchScriptOrder) {
    goal = `Generate ${amount} chronological stock-video search terms that follow ` +
      'the order of topics in the video script.';
    orderingRule =
      '6. keep the terms in the same order as the script narration; ' +
      'earlier terms must describe earlier visual moments.';

    // Build example terms dynamically based on requested amount
    const exampleTerms = [
      'opening visual topic',
      ...Array.from({ length: Math.max(amount - 2, 0) }, (_, i) => `script visual topic ${i + 2}`),
      'final visual topic',
    ];
    outputExample = JSON.stringify(exampleTerms.slice(0, amount));
  } else {
    goal = `Generate ${amount} search terms for stock videos, depending on the ` +
      'subject of a video.';
    orderingRule = '';
    outputExample = JSON.stringify([
      'search term 1',
      'search term 2',
      'search term 3',
      'search term 4',
      'search term 5',
    ]);
  }

  const prompt = [
    '# Role: Video Search Terms Generator',
    '',
    '## Goals:',
    goal,
    '',
    '## Constrains:',
    '1. the search terms are to be returned as a json-array of strings.',
    '2. each search term should consist of 1-3 words, always add the main subject of the video.',
    '3. you must only return the json-array of strings. you must not return anything else. you must not return the script.',
    '4. the search terms must be related to the subject of the video.',
    '5. reply with english search terms only.',
    orderingRule,
    '',
    '## Output Example:',
    outputExample,
    '',
    '## Context:',
    '### Video Subject',
    videoSubject,
    '',
    '### Video Script',
    videoScript,
    '',
    'Please note that you must use English for generating video search terms; other languages are not accepted.',
  ].filter(Boolean).join('\n');

  // --- Send to LLM with retries ---
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

  let searchTerms = [];
  let rawResponse = '';

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await model.generateContent([
        { text: 'You are a stock-video search term generator. Return ONLY valid JSON.' },
        { text: prompt },
      ]);
      rawResponse = result.response.text();

      const cleaned = stripCodeFence(rawResponse);
      searchTerms = JSON.parse(cleaned);

      if (!Array.isArray(searchTerms) || !searchTerms.every(t => typeof t === 'string')) {
        console.warn(`[stock-terms] Response is not a string array (attempt ${i + 1})`);
        searchTerms = [];
        continue;
      }

      // Success — break out
      break;
    } catch (err) {
      console.warn(`[stock-terms] Attempt ${i + 1}/${MAX_RETRIES} failed: ${err.message}`);

      // Last resort: try to extract a JSON array from the raw response with a regex
      if (rawResponse) {
        const match = rawResponse.match(/\[.*?\]/s);
        if (match) {
          try {
            searchTerms = JSON.parse(match[0]);
            if (Array.isArray(searchTerms) && searchTerms.every(t => typeof t === 'string')) {
              break;
            }
          } catch {
            // regex match didn't yield valid JSON, keep going
          }
        }
      }

      if (i < MAX_RETRIES - 1) {
        console.warn(`[stock-terms] Retrying... (${i + 1})`);
      }
    }
  }

  if (searchTerms.length === 0) {
    console.error('[stock-terms] All retries exhausted — returning empty array');
  }

  console.log(`[stock-terms] Generated ${searchTerms.length} terms:`, searchTerms);
  return searchTerms;
}
