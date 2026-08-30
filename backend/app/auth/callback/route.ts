import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseReqRes } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const doneUrl = new URL('/auth/done', url.origin);
  const loginUrl = new URL('/auth/login', url.origin);

  if (!code) {
    loginUrl.searchParams.set('error', 'Missing auth code');
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(doneUrl);
  const supabase = createSupabaseReqRes(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    loginUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
