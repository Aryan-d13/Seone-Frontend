'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleLogin, CredentialResponse, googleLogout } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { exchangeGoogleToken } from '@/services/auth';
import { useAuthStore } from '@/stores';
import { config } from '@/lib/config';
import { pageVariants, pageTransition } from '@/lib/animations';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Clear any existing Google session on mount
  useEffect(() => {
    googleLogout();
  }, []);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError('No credential received from Google');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Decode the JWT to get user info
      const payload = JSON.parse(atob(response.credential.split('.')[1]));

      // Exchange Google token for Seone JWT
      await exchangeGoogleToken(response.credential);

      // Set user in store from Google payload
      // (Backend JWT is stored in cookie, user info from Google token)
      setUser({
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: 'user',
      });

      // Redirect to dashboard
      router.replace('/dashboard');
    } catch (err) {
      console.error('Auth error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'this origin';
    setError(
      `Google sign-in failed. If Google shows "origin_mismatch", add ${origin} to Authorized JavaScript origins for OAuth client ${config.auth.googleClientId}.`
    );
  };

  return (
    <motion.div
      className={styles.container}
      initial="initial"
      animate="animate"
      variants={pageVariants}
      transition={pageTransition}
    >
      {/* Background Effects */}
      <div className={styles.bgGlow} />
      <div className={styles.bgGrid} />

      {/* Login Card */}
      <motion.div
        className={styles.card}
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        {/* Logo */}
        <div className={styles.logo}>
          <span className="gradient-text">Seone</span>
        </div>

        {/* Title */}
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>
          Sign in with your approved work account to continue
        </p>

        {/* Error Message */}
        {error && (
          <motion.div
            className={styles.error}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </motion.div>
        )}

        {/* Google Sign In Button with FedCM */}
        <div className={styles.googleButton}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>Signing in...</span>
            </div>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="filled_black"
              size="large"
              width="320"
              text="signin_with"
              shape="rectangular"
              useOneTap={false}
              use_fedcm_for_prompt={false}
              auto_select={false}
            />
          )}
        </div>

        {/* Domain Notice */}
        <p className={styles.notice}>Use your approved work account to continue</p>
      </motion.div>

      {/* Footer */}
      <div className={styles.footer}>
        <p>Seone Video Pipeline • Creative Fuel</p>
      </div>
    </motion.div>
  );
}
