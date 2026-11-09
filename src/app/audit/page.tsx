import type { Metadata } from 'next'
import { ArrowUpRight, DownloadSimple, FileText, Package } from '@phosphor-icons/react/dist/ssr'
import Link from 'next/link'
import { Note, PageHeader, Stat } from '@/components/ui'
import { BRAND } from '@/lib/config'

// The security self-assessment (report/kyte-security-self-assessment.html, published unchanged at /audit/report.html).
// Everything below mirrors that report; when a new version is issued, replace the three files in public/audit/ and edit
// REPORT. The report's own section anchors (#KYT-01...) are linked from the findings table.

export const metadata: Metadata = {
  title: `Security · ${BRAND.name}`,
  description: "Kyte security self-assessment: automated analysis, manual review and on-chain configuration checks of Kyte's deployed contracts on Robinhood Chain.",
}

const FILES = {
  html: '/audit/report.html',
  pdf: '/audit/kyte-security-self-assessment.pdf',
  zip: '/audit/kyte-security-self-assessment-raw.zip',
}

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational'

const REPORT = {
  version: '1.1',
  date: '9 November 2026',
  block: '109,974,684',
  chain: 'Robinhood Chain (4663)',
  counts: { Critical: 0, High: 0, Medium: 0, Low: 5, Informational: 5 } satisfies Record<Severity, number>,
  tools: 'Slither 0.11.4 (Trail of Bits) and Aderyn 0.6.8 (Cyfrin)',
  findings: [
    { id: 'KYT-01', sev: 'Low', title: 'The on-chain buyback route points to an unfunded pool (route not in use)' },
    { id: 'KYT-02', sev: 'Low', title: 'The on-chain buyback price floor follows the last fill (route not in use)' },
    { id: 'KYT-03', sev: 'Low', title: 'The Router can be blocked by sending it 1 wei of WETH (direct market access unaffected)' },
    { id: 'KYT-04', sev: 'Low', title: 'The timelock delay is 10 minutes on chain; the code comments describe 48 hours' },
    { id: 'KYT-05', sev: 'Low', title: 'Physical settlement depends on the underlying token staying transferable' },
    { id: 'KYT-06', sev: 'Informational', title: 'The guardian Safe needs a single signature' },
    { id: 'KYT-07', sev: 'Informational', title: 'StakingPool.notifyReward emits no event' },
    { id: 'KYT-08', sev: 'Informational', title: 'KyteHaltGate reverts instead of answering if the oracle reports a future timestamp' },
    { id: 'KYT-09', sev: 'Informational', title: 'Rebasing tokens would break collateral accounting' },
    { id: 'KYT-10', sev: 'Informational', title: 'Live contracts were built from different commits' },
  ] as { id: string; sev: Severity; title: string }[],
  scope: [
    ['CallMarket', 'Covered calls: escrow, buy, exercise, expire', '0xb6759D8893601BB7c1A032eC8ea40C856a6adf80', '58463816'],
    ['PutMarket', 'Cash-secured puts: escrow, buy, exercise, expire', '0x2E2d5DfB4cf30d15688Cc2DDD30641c78DFfcb35', '58463839'],
    ['Router', 'ETH entry point that wraps, calls a market and refunds', '0xdD76956667E6423bAC56d2EbF827a9b0d7dBDF68', '58463883'],
    ['OptionNFT', 'ERC-721 that represents each filled option', '0xe0cd21a7ed37898a5acdf7dc68c52259cd63308b', '58463804'],
    ['AssetRegistry', 'Token whitelist, caps and minimum strikes', '0x02f571e10B9c7303EB7A6284A7137b146e18658D', '58327992'],
    ['FeeVault', 'Collects fees and splits them each epoch', '0x78c569a1137b78cb78f42c42b4b6c2b8f1e3ddef', '57936203'],
    ['StakingPool', '$KYTE staking and WETH rewards', '0xD7253a90fd43507F44cF0934F3D5d7432760d17f', '58609771'],
    ['BuybackBurner', 'On-chain buyback and burn (not in use; buybacks are manual)', '0x8a9d128247d8c4512411cf9d0cdcac5acf86fb95', '58609773'],
    ['UniswapV4Adapter', 'Swap route used by BuybackBurner', '0xfa17818515e946180b9767f9d9c40a09ee80dda6', '58609785'],
    ['KyteHook', 'Uniswap v4 hook: TWAP oracle and protocol fee', '0x77e52e93aa0892b29a4527af4f3a79f01cfa9044', '57936350'],
    ['KyteHaltGate', "Reader of Harmonic's session oracle (not called by live contracts)", '0x3Ba49951cae0e9EF38839F9080b48bD254e0bc8b', '58822304'],
    ['TimelockController', 'OpenZeppelin timelock that owns settings (configuration reviewed)', '0xf8e6faf7e0e57bc91ad5c59b84fede2cab842893', '57936139'],
  ] as [string, string, string, string][],
  passed: [
    ['No admin path to escrowed collateral', 'Collateral only ever moves to its seller, or to the option holder on exercise.'],
    ['Exits are never paused', 'Cancel, exercise, expire, unstake, claim and split all work while paused. Pause only blocks new exposure.'],
    ['Reentrancy guarded', 'Every state-changing entry point uses nonReentrant (transient storage). State is final before any transfer.'],
    ['Fees capped in code', 'Premium fee ≤ 10% and exercise fee ≤ 1%, fixed per position. Live: 3% / 0.1%.'],
    ['Fee-on-transfer tokens rejected', 'Collateral pulls and stakes check that the balance grew by exactly the amount transferred.'],
    ['NFT minting locked to the markets', 'Only the market that owns an ID tag can mint or burn it. Markets are set once and wired correctly on chain.'],
    ['Fee split bounded', 'Shares must sum to 100% and stakers always get at least 20%.'],
    ['No just-in-time staking rewards', 'New stake waits one epoch and is then locked for a full epoch.'],
    ['Router holds nothing', 'Refunds go only to the caller. The Router held 0 WETH and 0 ETH at the snapshot block.'],
    ['Deployer has no lingering power', 'The deployer holds no timelock role, and OptionNFT market wiring is locked.'],
    ['Deployed code matches the source', 'Every contract in scope is a full Sourcify match (creation and runtime bytecode).'],
  ] as [string, string][],
  roles: [
    ['TimelockController', '0xf8e6faf7e0e57bc91ad5c59b84fede2cab842893', 'Minimum delay 600 s (10 min). Administers itself; the deployer holds no role. Sets fees within hard caps, Router, guardian, listings, fee destinations and split, unpause.'],
    ['Guardian', '0x9f433ee8020cfb3521bdae0dda612932e1e90ef0', 'Safe, 3 owners, threshold 1. Can pause new exposure or switch a listing off. Cannot unpause, enable anything or move funds.'],
    ['Operations Safe', '0xd97693df18dd20b8c7a542ea0e167c75f630ada5', 'Safe, 3 owners, threshold 2. Receives the operations share (50%) of each fee split. No protocol permissions.'],
    ['Buyback keeper', '0x32639bf2456bc69e1e59f68f7f56390299d5d455', 'Externally owned account. Only BuybackBurner.buyAndBurn, within on-chain bounds. Not used: buybacks are manual.'],
  ] as [string, string, string][],
  hashes: [
    ['kyte-security-self-assessment.pdf', '5ada21efbe57ec0296a2f216f21f262df9e9e00e66d4581b5c7d749303a9969a'],
    ['kyte-security-self-assessment-raw.zip', '69cc67a0e5096b1a92263f76901c726f155ef97cc0286add23bf48c91399499f'],
    ['report.html', '978a28242bbbaffd7ef02663ca4f2c555e5670872a55af91cc0dbde3381df22e'],
  ] as [string, string][],
}

const EXPLORER = 'https://robinhoodchain.blockscout.com/address/'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const SEV_CLASS: Record<Severity, string> = {
  Critical: 'bg-put/15 text-put',
  High: 'bg-put/10 text-put',
  Medium: 'bg-warn/10 text-warn',
  Low: 'bg-sky-400/10 text-sky-300',
  Informational: 'bg-white/[0.06] text-muted',
}

function Sev({ sev }: { sev: Severity }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider ${SEV_CLASS[sev]}`}>{sev === 'Informational' ? 'Info' : sev}</span>
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl text-ink">{title}</h2>
      {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export default function AuditPage() {
  const total = REPORT.findings.length
  return (
    <article>
      <PageHeader
        title="Security self-assessment"
        sub={`Automated analysis, manual code review and on-chain configuration checks of ${BRAND.name}'s deployed contracts on ${REPORT.chain}. Version ${REPORT.version}, ${REPORT.date}, snapshot block ${REPORT.block}.`}
      />

      <div className="flex flex-wrap items-center gap-3">
        <a href={FILES.html} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
          <FileText size={16} /> Open the full report <ArrowUpRight size={14} />
        </a>
        <a href={FILES.pdf} download className="btn btn-ghost">
          <DownloadSimple size={16} /> Download PDF
        </a>
        <a href={FILES.zip} download className="btn btn-ghost">
          <Package size={16} /> Raw tool outputs (.zip)
        </a>
      </div>

      <div className="mt-8">
        <Note tone="warn">
          This is a self-assessment by the {BRAND.name} team, not a third-party audit. {REPORT.tools} are open-source analysers; neither company reviewed {BRAND.name}.
          Static analysis and a team review cannot prove the absence of bugs. An independent audit is planned before significant growth in value locked. Only use funds you can afford to lose.
        </Note>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(Object.keys(REPORT.counts) as Severity[]).map((k) => (
          <Stat key={k} label={k} value={String(REPORT.counts[k])} />
        ))}
      </div>

      <Section title="Summary" sub="Twelve deployed contracts, about 1,750 lines of Kyte code excluding comments.">
        <div className="space-y-4 text-base leading-relaxed text-muted">
          <p className="text-pretty">
            The core option escrow is sound. Collateral can only go to its seller or to the option holder. Exits keep working while the protocol is paused. Every entry point is protected against reentrancy, and fees are capped in code.
          </p>
          <p className="text-pretty">
            The five low findings cover the on-chain buyback route, which is not in use (buybacks are currently executed manually), a griefing case on the ETH convenience Router that has a direct-WETH fallback, a timelock delay that differs from the code comments, and the dependency of physical settlement on token transferability. None of them allows anyone to take escrowed collateral or staked $KYTE.
          </p>
        </div>
      </Section>

      <Section title={`Findings (${total})`} sub="Each row opens the finding in the full report, with its impact, recommendation and the team's response.">
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-left text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {REPORT.findings.map((f) => (
                <tr key={f.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    <a href={`${FILES.html}#${f.id}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{f.id}</a>
                  </td>
                  <td className="px-4 py-3"><Sev sev={f.sev} /></td>
                  <td className="px-4 py-3 text-ink/85">{f.title}</td>
                  <td className="hidden px-4 py-3 text-muted sm:table-cell">Acknowledged</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Checks that passed" sub="Properties confirmed by reading the code and the live configuration.">
        <ul className="grid gap-x-8 sm:grid-cols-2">
          {REPORT.passed.map(([h, d]) => (
            <li key={h} className="hair flex gap-3 border-b py-4">
              <span className="mt-0.5 font-mono text-[#6EFF85]">✓</span>
              <span>
                <span className="block text-ink">{h}</span>
                <span className="mt-0.5 block text-sm text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Scope" sub={`The live contracts at block ${REPORT.block}. Each address is a full Sourcify match, so the code analysed is the code that runs. Out of scope: the $KYTE token contract, its trading pool, the Uniswap v4 PoolManager, Harmonic's oracle and off-chain systems.`}>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-bg-2 text-left text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-4 py-3 font-medium">Contract</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Sourcify</th>
              </tr>
            </thead>
            <tbody>
              {REPORT.scope.map(([name, desc, addr, match]) => (
                <tr key={name} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <span className="block text-ink">{name}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                    <a href={`${EXPLORER}${addr}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" title={addr}>{short(addr)}</a>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-muted md:table-cell">Full match #{match}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Roles and privileges" sub="Who can change what. Nobody can move escrowed collateral or staked $KYTE.">
        <div className="hair border-t">
          {REPORT.roles.map(([role, addr, can]) => (
            <div key={role} className="hair grid gap-1 border-b py-4 sm:grid-cols-[180px_1fr]">
              <div>
                <span className="block text-ink">{role}</span>
                <a href={`${EXPLORER}${addr}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-accent hover:underline" title={addr}>{short(addr)}</a>
              </div>
              <p className="text-sm text-muted">{can}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Method and reproduction" sub="Verified sources and compiler settings were taken from Sourcify for every address. Each contract was analysed with the settings of its own deployment (solc 0.8.28 or 0.8.26, via-IR, 200 optimiser runs, cancun). Every tool result was read against the code and classified as a finding, accepted design or false positive. Live settings were read through a public RPC at the snapshot block.">
        <p className="text-sm text-muted">
          The unedited Slither (JSON and text) and Aderyn (Markdown) outputs for every contract, the scope file and the on-chain snapshot are in the raw archive above. Exact commands are in <a href={`${FILES.html}#repro`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">section 13 of the report</a>.
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-bg-2 p-4">
          <div className="label">SHA-256 of the published files</div>
          <dl className="mt-2 space-y-1.5 font-mono text-xs">
            {REPORT.hashes.map(([f, h]) => (
              <div key={f} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
                <dt className="shrink-0 text-ink sm:w-80">{f}</dt>
                <dd className="break-all text-muted">{h}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <p className="mt-14 text-xs text-faint">
        {BRAND.name} · Security Self-Assessment v{REPORT.version}, {REPORT.date}. Provided for information only. This is not an audit, an endorsement or investment advice. Options can expire worthless.
        Read the <Link href="/docs#risks" className="text-accent hover:underline">rules and risks</Link>.
      </p>
    </article>
  )
}
