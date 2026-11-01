import type { Metadata } from 'next'
import { connection } from 'next/server'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { Inter_Tight, Space_Grotesk } from 'next/font/google'
import { DemoBanner } from '@/components/DemoBanner'
import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { Providers } from '@/components/Providers'
import { SmoothScroll } from '@/components/fx/SmoothScroll'
import { BRAND } from '@/lib/config'
import './globals.css'

// Landing page display faces (from the Kyte brand site): self-hosted by next/font, so the CSP stays 'self'.
const interTight = Inter_Tight({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-hero', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-display', display: 'swap' })

const description = 'Sell covered calls and cash secured puts on Robinhood Chain. Collect the premium up front, let the contract settle, and watch fees flow to stakers and burns.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010'),
  title: `${BRAND.name} · Covered options on Robinhood Chain`,
  description,
  openGraph: {
    title: `${BRAND.name} · Covered options on Robinhood Chain`,
    description,
    siteName: BRAND.name,
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: `${BRAND.name}: options, on your terms` }],
  },
  twitter: { card: 'summary_large_image', title: `${BRAND.name} · Covered options on Robinhood Chain`, description },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Dynamic rendering, so src/proxy.ts can give every page a fresh CSP nonce.
  await connection()
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${interTight.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans">
        <a href="#content" className="skip-link">Skip to content</a>
        <Providers>
          <SmoothScroll>
            <DemoBanner />
            <Nav />
            <main id="content" className="mx-auto w-full max-w-6xl px-4 pb-8 md:px-6">{children}</main>
            <Footer />
          </SmoothScroll>
        </Providers>
      </body>
    </html>
  )
}
