import { PageHeader } from '@/components/ui'
import { chain, contracts, explorerAddress } from '@/lib/chains'
import { BRAND, FEES, LIMITS, SPLIT } from '@/lib/config'
import { bps } from '@/lib/format'

const CONTRACT_LABELS: [keyof typeof contracts, string][] = [
  ['callMarket', 'CallMarket'], ['putMarket', 'PutMarket'], ['optionNft', 'OptionNFT'], ['assetRegistry', 'AssetRegistry'],
  ['feeVault', 'FeeVault'], ['stakingPool', 'StakingPool'], ['buybackBurner', 'BuybackBurner'], ['kyteHook', 'KyteHook (Uniswap v4 hook)'], ['swapAdapter', 'UniswapV4Adapter'],
  ['router', 'Router'], ['kyteToken', `${BRAND.token} token`], ['weth', 'WETH'], ['uniswapV4PoolManager', 'Uniswap v4 PoolManager'],
]

export default function DocsPage() {
  return (
    <>
      <PageHeader title="Docs" sub={`How ${BRAND.name} works, what it costs, and what can go wrong.`} />

      <div className="grid gap-10 lg:grid-cols-4">
        <nav className="hidden space-y-2 font-mono text-sm text-muted lg:block">
          {[['how', 'How it works'], ['fees', 'Fees'], ['v4', 'Uniswap v4'], ['rules', 'Rules'], ['risks', 'Risks'], ['contracts', 'Contracts']].map(([id, l]) => (
            <a key={id} href={`#${id}`} className="block hover:text-accent">// {l}</a>
          ))}
        </nav>

        <article className="space-y-12 text-sm leading-relaxed text-muted lg:col-span-3 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
          <section id="how">
            <h2>How it works</h2>
            <p>A <strong>covered call</strong> seller locks tokens and sets a strike price in ETH, an expiry and a premium. A buyer pays the premium and receives an Option NFT. Until expiry, whoever holds the NFT can pay the strike and receive the tokens. After expiry, anyone can call <code>expire</code> and the tokens return to the seller.</p>
            <p className="mt-3">A <strong>cash-secured put</strong> is the mirror image: the seller locks ETH (as WETH), and the holder can sell them the tokens at the strike before expiry.</p>
            <p className="mt-3">Settlement is physical. No price oracle is involved, and the holder decides whether settling is worth it. The Option NFT can be transferred, and whoever holds it at settlement gets the payout.</p>
          </section>

          <section id="fees">
            <h2>Fees</h2>
            <ul className="space-y-1">
              <li><strong>{bps(FEES.premiumBps)}</strong> of the premium, when an offer is filled.</li>
              <li><strong>{bps(FEES.exerciseBps)}</strong> of the strike, when an option is settled.</li>
              <li>Cancelling an unfilled offer and expiring are free, apart from gas.</li>
            </ul>
            <p className="mt-3">Fees are recorded on each position when it&apos;s created, so a later fee change never affects an open position. The FeeVault splits fees once per epoch: <strong>{bps(SPLIT.stakersBps)}</strong> to {BRAND.token} stakers, <strong>{bps(SPLIT.buybackBps)}</strong> to buy and burn {BRAND.token} on Uniswap v4, and <strong>{bps(SPLIT.opsBps)}</strong> to operations.</p>
          </section>

          <section id="v4">
            <h2>Uniswap v4 inside {BRAND.name}</h2>
            <p>{BRAND.name} does not run its own exchange. Three pieces of the protocol sit on <strong>Uniswap v4</strong> on Robinhood Chain:</p>
            <ul className="mt-3 space-y-1">
              <li><strong>Buyback and burn.</strong> Every epoch, 20% of fees are swapped for {BRAND.token} straight on the v4 PoolManager by <code>UniswapV4Adapter</code> and burned in the same transaction. The <code>Burned</code> event is the proof.</li>
              <li><strong>KyteHook, a v4 hook on the {BRAND.token}/WETH pool.</strong> It records a price observation after every swap and exposes a 10 minute <strong>TWAP</strong>, so the buyback&apos;s slippage bound is checked against a time weighted price that a single block cannot move. The same hook takes <strong>0.1%</strong> of the WETH side of every swap in that pool and sends it to the FeeVault, where it joins the 30 / 20 / 50 split like every other {BRAND.name} fee.</li>
              <li><strong>Price feed.</strong> The charts on the Market and Sell pages are built from v4 <code>Swap</code> events for each listed token&apos;s WETH pool; nothing is quoted from an off chain API.</li>
            </ul>
            <p className="mt-3">A v4 hook&apos;s permissions are encoded in its address, so KyteHook is deployed at a mined CREATE2 address with the <code>afterInitialize</code>, <code>afterSwap</code> and <code>afterSwapReturnDelta</code> bits set. Its fee rate (max 1%) and vault can only be changed by the timelock.</p>
          </section>

          <section id="rules">
            <h2>Rules</h2>
            <ul className="space-y-1">
              <li>Expiry is between {LIMITS.minDurationSec / 3600} hour and {LIMITS.maxDurationSec / 86400} days away.</li>
              <li>Each offer has its own fill deadline, which can&apos;t be later than expiry. After it passes, the seller can reclaim the collateral.</li>
              <li>The minimum premium is {LIMITS.minPremiumEth} ETH.</li>
              <li>Only listed tokens can be used. Fee-on-transfer and rebasing tokens are rejected.</li>
              <li>Pausing only blocks new offers and fills. Cancel, settle, expire, unstake and claim always work.</li>
              <li>Payouts arrive as WETH. Unwrap to ETH from the Positions page.</li>
            </ul>
          </section>

          <section id="risks">
            <h2>Risks</h2>
            <ul className="space-y-1">
              <li><strong>Sellers</strong> give up upside above the strike (calls), or must buy tokens that may keep falling (puts).</li>
              <li><strong>Buyers</strong> can lose the entire premium if the option isn&apos;t worth settling.</li>
              <li><strong>Settle early.</strong> Robinhood Chain has a single sequencer. A transaction that lands after expiry fails.</li>
              <li>Listed tokens can be volatile, illiquid, or have admin controls such as blocklists.</li>
              <li>Smart contracts can have bugs. Only use funds you can afford to lose.</li>
            </ul>
          </section>

          <section id="contracts">
            <h2>Contracts on {chain.name}</h2>
            <div className="card divide-y divide-line">
              {CONTRACT_LABELS.map(([key, label]) => {
                const addr = contracts[key] as string | undefined
                const url = addr && explorerAddress(addr)
                return (
                  <div key={key} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm">
                    <span className="text-ink">{label}</span>
                    {addr ? (url ? <a href={url} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{addr}</a> : <span className="font-mono">{addr}</span>) : <span className="text-faint">not deployed yet</span>}
                  </div>
                )
              })}
            </div>
            {contracts.tokens && (
              <div className="card mt-3 divide-y divide-line">
                {Object.entries(contracts.tokens).map(([sym, addr]) => (
                  <div key={sym} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"><span className="text-ink">{sym} (listed token)</span><span className="font-mono">{addr}</span></div>
                ))}
              </div>
            )}
          </section>
        </article>
      </div>
    </>
  )
}
