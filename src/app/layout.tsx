import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Outfit, DM_Sans } from 'next/font/google';
import './globals.css';
import { PageTransition } from '@/components/layout/PageTransition';
import { WarmupDebugLogger } from '@/components/layout/WarmupDebugLogger';
import { parseWarmupDebugPayload } from '@/lib/requestWarmup';

const outfit = Outfit({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const dmSans = DM_Sans({
  variable: '--font-mono', // Reusing this variable for secondary text/numbers for now
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Seone | AI Video Pipeline',
  description: 'AI-driven video processing and content generation platform',
  icons: {
    icon: '/favicon.ico',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const warmupDebugPayload = parseWarmupDebugPayload(requestHeaders);

  return (
    <html lang="en" className="dark">
      <body className={`${outfit.variable} ${dmSans.variable}`}>
        <WarmupDebugLogger payload={warmupDebugPayload} />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
