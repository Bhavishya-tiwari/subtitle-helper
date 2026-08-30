import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim())
  });
}
