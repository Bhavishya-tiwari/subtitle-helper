// Flip to 'production' before zipping the extension for others.
// Chrome extensions have no process.env — this is the switch.

/** @type {'development' | 'production'} */
export const NODE_ENV = 'development';

const BACKENDS = {
  development: ['http://localhost:9333', 'http://127.0.0.1:9333'],
  production: ['https://subtitle-helper-theta.vercel.app']
};

export const BACKEND_URLS = BACKENDS[NODE_ENV];
export const BACKEND_URL = BACKEND_URLS[0];
export const AUTH_LOGIN_URL = `${BACKEND_URL}/auth/login`;
export const MAX_TEXT_LENGTH = 500;
export const FETCH_TIMEOUT_MS = 20_000;
export const DEFAULT_TARGET_LANG = 'hi';

// Public values from Supabase → Project Settings → API
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
