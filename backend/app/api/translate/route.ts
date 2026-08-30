import { NextRequest, NextResponse } from 'next/server';
import { consumeAiQuota, secondsUntilUtcMidnight } from '@/lib/rate-limit';
import { getBearerToken, getUserFromRequest, isAuthConfigured } from '@/lib/supabase';
import {
  ALLOWED_LANGUAGES,
  MAX_TEXT_LENGTH,
  TargetLang,
  sanitizeInput,
  translateSubtitle
} from '@/lib/translate';

function getApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
  return key || null;
}

function publicErrorDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  const status = raw.match(/Gemini API error (\d+)/);
  if (status) return `Gemini API error ${status[1]}`;
  if (raw.includes('Empty response')) return 'Empty response from Gemini';
  return 'Translation failed';
}

export async function POST(request: NextRequest) {
  try {
    let accessToken: string | null = null;
    if (isAuthConfigured()) {
      const user = await getUserFromRequest(request);
      accessToken = getBearerToken(request);
      if (!user || !accessToken) {
        return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      }
    }

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

    if (accessToken) {
      let quota;
      try {
        quota = await consumeAiQuota(accessToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/consume_ai_quota|Could not find the function/i.test(message)) {
          return NextResponse.json({ error: 'Rate limit is not configured' }, { status: 503 });
        }
        throw err;
      }

      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: 'Daily translation limit reached',
            used: quota.used,
            limit: quota.limit,
            remaining: 0
          },
          {
            status: 429,
            headers: { 'Retry-After': String(secondsUntilUtcMidnight()) }
          }
        );
      }
    }

    const result = await translateSubtitle(sanitizeInput(text), targetLang as TargetLang, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Translation error:', message.replace(/key=[^&\s]+/gi, 'key=REDACTED'));
    return NextResponse.json({ error: publicErrorDetail(err) }, { status: 500 });
  }
}
