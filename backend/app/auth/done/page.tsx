'use client';

import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';

const AUTH_MESSAGE = 'ST_AUTH_SESSION';

export default function AuthDonePage() {
  const [status, setStatus] = useState('Finishing sign-in…');

  useEffect(() => {
    finishLogin().catch((err: unknown) => {
      setStatus(err instanceof Error ? err.message : 'Sign-in failed');
    });
  }, []);

  async function finishLogin() {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('No session returned. Try signing in again.');

    window.postMessage(
      {
        type: AUTH_MESSAGE,
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
          user: {
            id: data.session.user.id,
            email: data.session.user.email || ''
          }
        }
      },
      window.location.origin
    );

    setStatus('Signed in. You can close this tab and return to the extension.');
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-indigo-300">Subtitle Translator</p>
        <h1 className="mt-2 text-xl font-semibold">Google sign-in</h1>
        <p className="mt-3 text-sm text-gray-300">{status}</p>
      </div>
    </main>
  );
}
