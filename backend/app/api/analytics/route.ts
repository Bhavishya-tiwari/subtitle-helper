import { NextResponse } from 'next/server';
import { getStats } from '@/lib/analytics';

export function GET() {
  return NextResponse.json(getStats());
}
