import { NextRequest, NextResponse } from 'next/server';
import { getNextApiKey } from '@/lib/gemini-keys';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  ALLOWED_LANGUAGES,
  MAX_TEXT_LENGTH,
  TargetLang,
  sanitizeInput,
  translateSubtitle
} from '@/lib/translate';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please try again later' },
      { status: 429, headers: rate.retryAfterSec ? { 'Retry-After': String(rate.retryAfterSec) } : undefined }
    );
  }

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

    const apiKeyInfo = getNextApiKey();
    if (!apiKeyInfo) {
      return NextResponse.json({ error: 'Translation service not configured' }, { status: 503 });
    }

    const sanitizedText = sanitizeInput(text);
    const result = await translateSubtitle(sanitizedText, targetLang as TargetLang, apiKeyInfo.key);

    return NextResponse.json(result);
  } catch (err) {
    console.error('Translation error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
