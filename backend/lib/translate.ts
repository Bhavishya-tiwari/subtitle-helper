export const ALLOWED_LANGUAGES = ['hi', 'es', 'fr', 'de', 'ja', 'ko', 'zh', 'pt', 'ar', 'ru'] as const;
export type TargetLang = (typeof ALLOWED_LANGUAGES)[number];

export const MAX_TEXT_LENGTH = 500;
export const GEMINI_MODEL = 'gemini-2.5-flash-lite';

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

export async function translateSubtitle(text: string, targetLang: TargetLang, apiKey: string): Promise<TranslationResult> {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;

  const prompt = `You help users understand video subtitles. The subtitle may be in any language.

INPUT_START
${text}
INPUT_END

The user's preferred language is ${langName}.

Tasks:
1. If the subtitle is NOT already in ${langName}, translate it naturally into ${langName}.
2. If the subtitle is ALREADY in ${langName}, use the original text as the translation.
3. Identify complex or uncommon words/phrases in the original subtitle and briefly explain each in ${langName}. Use [] if none.

Reply ONLY as JSON:
{"translation": "...", "context": "...", "terms": [{"phrase": "...", "meaning": "..."}]}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty response from Gemini');
  }

  return parseGeminiResponse(responseText);
}

function parseGeminiResponse(responseText: string): TranslationResult {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        translation?: string;
        context?: string;
        terms?: Array<{ phrase?: string; word?: string; meaning?: string }>;
        words?: Array<{ phrase?: string; word?: string; meaning?: string }>;
      };

      const terms = Array.isArray(parsed.terms) ? parsed.terms : parsed.words || [];
      const context = validateOutput(parsed.context);
      const termMeanings = terms
        .filter(t => (t.phrase || t.word) && t.meaning)
        .map(t => `${t.phrase || t.word}: ${t.meaning}`)
        .join(' | ');
      const notes = [context ? `Context: ${context}` : '', termMeanings].filter(Boolean).join(' | ');

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
