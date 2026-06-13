import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'analytics.json');
const MAX_EVENTS = 50;

export type AnalyticsEvent = {
  timestamp: string;
  keyLabel: string;
  model: string;
  targetLang: string;
  inputLength: number;
  success: boolean;
  errorType: string | null;
  latencyMs: number;
};

let events: AnalyticsEvent[] = [];

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as { events?: AnalyticsEvent[] };
      events = Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : [];
    }
  } catch {
    events = [];
  }
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ events }, null, 2));
  } catch (err) {
    console.error('Failed to save analytics:', err instanceof Error ? err.message : err);
  }
}

export function record(event: {
  keyLabel?: string;
  model?: string;
  targetLang?: string;
  inputLength?: number;
  success: boolean;
  errorType?: string | null;
  latencyMs?: number;
}) {
  events.push({
    timestamp: new Date().toISOString(),
    keyLabel: event.keyLabel || 'unknown',
    model: event.model || 'gemini-2.5-flash-lite',
    targetLang: event.targetLang || '??',
    inputLength: event.inputLength || 0,
    success: event.success,
    errorType: event.errorType || null,
    latencyMs: event.latencyMs || 0
  });

  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }

  save();
}

export function getStats() {
  const total = events.length;
  const successful = events.filter(e => e.success);
  const failed = events.filter(e => !e.success);
  const totalLatency = successful.reduce((sum, e) => sum + e.latencyMs, 0);

  const byKey: Record<string, { total: number; success: number; failed: number; avgLatencyMs: number }> = {};
  for (const e of events) {
    const k = e.keyLabel;
    if (!byKey[k]) byKey[k] = { total: 0, success: 0, failed: 0, avgLatencyMs: 0 };
    byKey[k].total++;
    if (e.success) {
      byKey[k].success++;
    } else {
      byKey[k].failed++;
    }
  }

  for (const k of Object.keys(byKey)) {
    const keyEvents = successful.filter(e => e.keyLabel === k);
    byKey[k].avgLatencyMs = keyEvents.length > 0
      ? Math.round(keyEvents.reduce((s, e) => s + e.latencyMs, 0) / keyEvents.length)
      : 0;
  }

  const byLang: Record<string, number> = {};
  for (const e of events) {
    byLang[e.targetLang] = (byLang[e.targetLang] || 0) + 1;
  }

  const byError: Record<string, number> = {};
  for (const e of failed) {
    if (e.errorType) {
      byError[e.errorType] = (byError[e.errorType] || 0) + 1;
    }
  }

  return {
    total,
    success: successful.length,
    failed: failed.length,
    avgLatencyMs: successful.length > 0 ? Math.round(totalLatency / successful.length) : 0,
    byKey,
    byLang,
    byError,
    recentEvents: events.slice(-20).reverse()
  };
}

load();
