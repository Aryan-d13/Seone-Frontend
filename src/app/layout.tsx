import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '500 | System Maintenance',
  description: 'Seone is currently offline for critical maintenance.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children, // Kept to satisfy Next.js Layout requirements but not rendered
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`} style={{ margin: 0, padding: 0, overflow: 'hidden', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

        {/* Background Atmosphere */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80vh',
          height: '80vh',
          background: 'radial-gradient(circle, var(--accent-primary-muted) 0%, transparent 60%)',
          opacity: 0.8,
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 10,
          textAlign: 'center',
          animation: 'fadeIn var(--transition-slow) ease-out'
        }}>
          {/* Bold Typography for 500 */}
          <h1 style={{
            fontSize: 'min(15vw, 12rem)',
            lineHeight: 1,
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.05em',
            textShadow: 'var(--shadow-glow-error)'
          }}>
            500
          </h1>

          <div style={{
            width: '48px',
            height: '4px',
            backgroundColor: 'var(--accent-primary)',
            margin: 'var(--space-6) 0 var(--space-8)',
            borderRadius: 'var(--radius-full)'
          }} />

          <h2 style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-2xl)',
            color: 'var(--text-primary)',
            margin: '0 0 var(--space-4) 0',
            letterSpacing: '-0.02em',
            fontWeight: 600
          }}>
            SYSTEM RECALIBRATION
          </h2>

          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            maxWidth: '500px',
            lineHeight: 'var(--leading-relaxed)',
            margin: '0 20px',
            opacity: 0.9
          }}>
            The rendering pipeline and core services are temporarily offline for structural upgrades.
            All active jobs have been safely paused and queued.
          </p>

          <div className="animate-pulse" style={{
            marginTop: 'calc(var(--space-10) * 1.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--accent-primary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase'
          }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', boxShadow: 'var(--shadow-glow)' }} />
            System Offline
          </div>
        </div>

      </body>
    </html>
  );
}
