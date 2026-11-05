'use client'

import { useConnectWallet, useWallets } from '@privy-io/react-auth'
import { useSetActiveWallet } from '@privy-io/wagmi'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { chain } from '@/lib/chains'
import { PRIVY_APP_ID } from '@/lib/config'
import { shortAddr } from '@/lib/format'

// Privy's connect-only flow (no login) remembers the wallet in its own store, but it never makes that wallet
// wagmi's account again after a full page load: that only happened in connectWallet's onSuccess, which does
// not run on reload. We remember the chosen address here and re-activate it once Privy lists the wallet again.
const SAVED_WALLET = 'kyte:wallet'

export function ConnectButton() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <button className="btn btn-ghost btn-sm" disabled>Connect</button>
  return PRIVY_APP_ID ? <PrivyConnect /> : <InjectedConnect />
}

/** Privy's wallet picker, limited to wallets installed in this browser. The chosen wallet becomes wagmi's account. */
function PrivyConnect() {
  const router = useRouter()
  const path = usePathname()
  const { address, chainId, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { wallets, ready } = useWallets()
  const { setActiveWallet } = useSetActiveWallet()
  const [target, setTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      if (wallet.type !== 'ethereum') return setError('Please use an Ethereum wallet.')
      const addr = wallet.address.toLowerCase()
      localStorage.setItem(SAVED_WALLET, addr)
      setTarget(addr)
    },
    onError: (e) => {
      const m = String(e)
      if (m !== 'exited_link_flow' && m !== 'user_exited_link_flow') setError(m)
    },
  })
  // Once Privy lists the connected wallet, make it the active wagmi account.
  useEffect(() => {
    if (!target) return
    const w = wallets.find((x) => x.address.toLowerCase() === target)
    if (!w) return
    setTarget(null)
    setActiveWallet(w)
      .then(() => { if (path === '/') router.push('/market') })
      .catch((e) => setError(String(e)))
  }, [target, wallets, setActiveWallet, path, router])
  // After a reload: Privy has silently re-detected the wallet (eth_accounts, no prompt) but wagmi has no account.
  // Re-activate the wallet we saved, once per address, so the session survives navigation and refreshes.
  const [restored, setRestored] = useState<string | null>(null)
  useEffect(() => {
    if (!ready || isConnected || target) return
    const saved = localStorage.getItem(SAVED_WALLET)
    if (!saved || saved === restored) return
    const w = wallets.find((x) => x.address.toLowerCase() === saved)
    if (!w) return
    setRestored(saved)
    setActiveWallet(w).catch((e) => setError(String(e)))
  }, [ready, wallets, isConnected, target, restored, setActiveWallet])

  const forget = () => {
    localStorage.removeItem(SAVED_WALLET)
    setRestored(null)
    disconnect()
  }

  if (!isConnected || !address) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="hidden max-w-48 truncate text-xs text-danger md:inline" title={error}>{error}</span>}
        <button className="btn btn-primary btn-sm" onClick={() => { setError(null); connectWallet() }}>Connect wallet</button>
      </div>
    )
  }
  if (chainId !== chain.id) {
    return (
      <button className="btn btn-sm border border-warn/50 text-warn" onClick={() => switchChain({ chainId: chain.id })}>
        Switch to {chain.name}
      </button>
    )
  }
  return (
    <button className="btn btn-ghost btn-sm font-mono" onClick={forget} title="Disconnect">
      <span className="size-2 rounded-full bg-accent" />
      {shortAddr(address)}
    </button>
  )
}

/** Fallback without Privy: the browser's injected provider. */
function InjectedConnect() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  if (!isConnected || !address) {
    const injected = connectors[0]
    return (
      <button className="btn btn-primary btn-sm" disabled={!injected || isPending} onClick={() => injected && connect({ connector: injected, chainId: chain.id })}>
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }
  if (chainId !== chain.id) {
    return <button className="btn btn-sm border border-warn/50 text-warn" onClick={() => switchChain({ chainId: chain.id })}>Switch to {chain.name}</button>
  }
  return (
    <button className="btn btn-ghost btn-sm font-mono" onClick={() => disconnect()} title="Disconnect">
      <span className="size-2 rounded-full bg-accent" />
      {shortAddr(address)}
    </button>
  )
}
