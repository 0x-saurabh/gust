// Logos the indexer knows for listed tokens (launchpad tokens: FOBO metadata, DexScreener, Pons ipfs via the site
// proxy). useAssets() registers them; TokenLogo reads them, so every token row on the site shows the launch's logo.
const LOGOS = new Map<string, string>()
export function registerTokenLogos(list: Array<{ address: string; logo?: string | null }>) {
  for (const a of list) if (a.logo) LOGOS.set(a.address.toLowerCase(), a.logo)
}
export const indexedLogo = (address?: string) => (address ? LOGOS.get(address.toLowerCase()) : undefined)
