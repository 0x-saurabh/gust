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

// Link previews (Telegram, X, Discord, iMessage...): same card as the Kyte brand site.
const title = `${BRAND.name} | Options, on Your terms`
const description = 'A non-custodial, fully collateralised options market on Robinhood Chain. Covered calls, cash-secured puts, Option NFTs.'
const shortDescription = 'A non-custodial, fully collateralised options market on Robinhood Chain.'
const ogImage = {
  url: '/og-image.jpg',
  type: 'image/jpeg',
  width: 2400,
  height: 1260,
  alt: `${BRAND.name}: Options, on Your terms. A non-custodial options market on Robinhood Chain.`,
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3010'),
  title,
  description,
  openGraph: { title, description, url: '/', siteName: BRAND.name, type: 'website', images: [ogImage] },
  twitter: {
    card: 'summary_large_image',
    site: '@useKyte',
    title,
    description: shortDescription,
    images: [{ url: ogImage.url, alt: ogImage.alt }],
  },
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
