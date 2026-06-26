export const ALLOWED_LANGUAGES = ['hi', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'pt', 'ar', 'ru'] as const;
export type TargetLang = (typeof ALLOWED_LANGUAGES)[number];

export const MAX_TEXT_LENGTH = 500;
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

const LANGUAGE_NAMES: Record<string, string> = {
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  pt: 'Portuguese',
  ar: 'Arabic',
  ru: 'Russian'
};

export type TranslationResult = {
  translation: string;
  meaning: string;
};

export function sanitizeInput(text: string): string {
  return text
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function translateSubtitle(text: string, targetLang: TargetLang, apiKey: string): Promise<TranslationResult> {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;

  const prompt = `Translate this subtitle to ${langName} and explain difficult words.

INPUT_START
${text}
INPUT_END

Tasks:
1. Translate to ${langName} (or use original if already in ${langName})
2. List difficult/uncommon words with brief meanings in ${langName}. Use [] if none.

Reply ONLY as JSON:
{"translation": "...", "terms": [{"word": "...", "meaning": "..."}]}`;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 150
            }
          })
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        const isRetryable = response.status === 503 || response.status === 429 || response.status >= 500;
        
        if (isRetryable && attempt < maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms (status: ${response.status})`);
          await sleep(backoffMs);
          lastError = new Error(`Gemini API error ${response.status}: ${errorBody}`);
          continue;
        }
        
        throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      return parseGeminiResponse(responseText);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Network error, retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      
      throw lastError;
    }
  }

  throw lastError || new Error('Translation failed after retries');
}

function parseGeminiResponse(responseText: string): TranslationResult {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        translation?: string;
        terms?: Array<{ phrase?: string; word?: string; meaning?: string }>;
      };

      const terms = Array.isArray(parsed.terms) ? parsed.terms : [];
      const termMeanings = terms
        .filter(t => (t.phrase || t.word) && t.meaning)
        .map(t => `${t.phrase || t.word}: ${t.meaning}`)
        .join(' | ');
      const notes = termMeanings;

      return {
        translation: validateOutput(parsed.translation) || 'Translation unavailable',
        meaning: notes
      };
    } catch {
      // Fall through
    }
  }

  return {
    translation: responseText.trim().slice(0, 300),
    meaning: ''
  };
}

function validateOutput(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;

  const sensitivePatterns = [/api[_-]?key/gi, /password/gi, /secret/gi, /token/gi];
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) return null;
  }

  return text.slice(0, 500);
}
