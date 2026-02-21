'use client';

import { GoogleOAuthProvider as Provider } from '@react-oauth/google';
import { config } from '@/lib/config';

interface GoogleOAuthProviderProps {
  children: React.ReactNode;
}

export function GoogleOAuthProvider({ children }: GoogleOAuthProviderProps) {
  return (
    <Provider
      clientId={config.auth.googleClientId}
      onScriptLoadError={() => console.error('Google script failed to load')}
    >
      {children}
    </Provider>
  );
}
