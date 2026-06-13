import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').length > 0
  });
}
