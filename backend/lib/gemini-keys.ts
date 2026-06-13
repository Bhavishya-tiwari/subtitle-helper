let keyIndex = 0;

export function getApiKeys(): string[] {
  const keys = process.env.GEMINI_API_KEYS;
  if (keys) {
    return keys.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }
  const single = process.env.GEMINI_API_KEY;
  return single ? [single] : [];
}

export function hasApiKeys(): boolean {
  return getApiKeys().length > 0;
}

export function getNextApiKey(): { key: string; label: string } | null {
  const keys = getApiKeys();
  if (keys.length === 0) return null;

  const idx = keyIndex % keys.length;
  const key = keys[idx];
  keyIndex = (keyIndex + 1) % keys.length;

  const label = `key_${idx + 1} (••••${key.slice(-4)})`;
  console.log(`Using API key ${idx + 1}/${keys.length}`);

  return { key, label };
}
