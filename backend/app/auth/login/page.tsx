'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromCallback = params.get('error');
    if (fromCallback) {
      setError(fromCallback);
      return;
    }

    startGoogleLogin().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in');
    });
  }, []);

  async function startGoogleLogin() {
    if (starting) return;
    setStarting(true);
    setError('');
    const supabase = getBrowserSupabase();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    if (oauthError) {
      setStarting(false);
      throw oauthError;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-indigo-300">Subtitle Translator</p>
        <h1 className="mt-2 text-xl font-semibold">Sign in with Google</h1>
        <p className="mt-2 text-sm text-gray-400">
          {starting ? 'Redirecting to Google…' : 'Continue to sign in.'}
        </p>
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        <button
          type="button"
          onClick={() => startGoogleLogin()}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
        >
          Continue with Google
        </button>
      </div>
    </main>
  );
}
