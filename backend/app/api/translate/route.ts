import { NextRequest, NextResponse } from 'next/server';
import {
  ALLOWED_LANGUAGES,
  MAX_TEXT_LENGTH,
  TargetLang,
  sanitizeInput,
  translateSubtitle
} from '@/lib/translate';

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, targetLang } = body as { text?: unknown; targetLang?: unknown };

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid "text" field' }, { status: 400 });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Text exceeds ${MAX_TEXT_LENGTH} character limit` },
        { status: 400 }
      );
    }

    if (!targetLang || !ALLOWED_LANGUAGES.includes(targetLang as TargetLang)) {
      return NextResponse.json(
        { error: `Invalid target language. Allowed: ${ALLOWED_LANGUAGES.join(', ')}` },
        { status: 400 }
      );
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Translation service not configured' }, { status: 503 });
    }

    const result = await translateSubtitle(sanitizeInput(text), targetLang as TargetLang, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Translation error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
