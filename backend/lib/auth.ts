// Placeholder for future Google OAuth integration (NextAuth / Auth.js).
// Extension calls will eventually require a session token from Google login.

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
};

export async function getAuthenticatedUser(_request: Request): Promise<AuthUser | null> {
  // TODO: validate session/JWT once Google login is added
  return null;
}
