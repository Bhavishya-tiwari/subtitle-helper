import { createClient } from '@supabase/supabase-js';

export type QuotaResult = {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
};

export async function consumeAiQuota(accessToken: string): Promise<QuotaResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured');
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });

  const { data, error } = await supabase.rpc('consume_ai_quota');
  if (error) {
    throw new Error(error.message);
  }

  const quota = data as QuotaResult | null;
  if (!quota || typeof quota.allowed !== 'boolean') {
    throw new Error('Invalid quota response');
  }

  return quota;
}

export function secondsUntilUtcMidnight(): number {
  const now = Date.now();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}
