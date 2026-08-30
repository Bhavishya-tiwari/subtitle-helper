import { NextRequest, NextResponse } from 'next/server';
import { getAiQuota } from '@/lib/rate-limit';
import { getBearerToken, getUserFromRequest, isAuthConfigured } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: 'Auth is not configured' }, { status: 503 });
  }

  const user = await getUserFromRequest(request);
  const token = getBearerToken(request);
  if (!user || !token) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const quota = await getAiQuota(token);
    return NextResponse.json({
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/get_ai_quota|Could not find the function/i.test(message)) {
      return NextResponse.json({ error: 'Rate limit is not configured' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Could not load quota' }, { status: 500 });
  }
}