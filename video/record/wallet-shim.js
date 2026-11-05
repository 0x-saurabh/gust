// "Demo Wallet": an EIP-1193 provider for Playwright `page.addInitScript({ path })`.
// Announces itself over EIP-6963 and sets window.ethereum. Account requests are answered locally with the
// current persona; everything else (eth_sendTransaction, personal_sign, eth_signTypedData_v4, eth_call, ...)
// is forwarded to the local anvil fork, which signs for its unlocked dev accounts. Dependency-free.
//
//   window.__demoWallet.setPersona('seller' | 'buyer' | 'seeder2' | ...)   switch account, emits accountsChanged
//   window.__demoWallet.address                                          current account
//   window.__demoWallet.log                                              last 200 requests { method, ms, error? }
//
// Overrides (set before the shim runs, e.g. another addInitScript): window.__DEMO_WALLET_CONFIG =
//   { rpc: 'http://127.0.0.1:8549', persona: 'seller', chainId: 4663, connected: false }
// The persona also persists in localStorage ('demoWallet:persona') so it survives reloads and navigations.
;(() => {
  if (window.__demoWallet) return
  const cfg = window.__DEMO_WALLET_CONFIG || {}
  const RPC = cfg.rpc || 'http://127.0.0.1:8549'
  const CHAIN_ID = '0x' + Number(cfg.chainId || 4663).toString(16) // 0x1237
  const PERSONAS = {
    seller: '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // anvil #0
    buyer: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', // anvil #1
    seeder2: '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc', // anvil #2
    seeder3: '0x90f79bf6eb2c4f870365e785982e1f101e93b906', // anvil #3
    seeder4: '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65', // anvil #4
  }
  const KEY = 'demoWallet:persona'
  let stored = null
  try { stored = localStorage.getItem(KEY) } catch {}
  let persona = cfg.persona || stored || 'seller'
  if (!PERSONAS[persona]) persona = 'seller'
  // Like a real wallet: no accounts until the site asks (eth_requestAccounts), so the page shows "Connect wallet"
  // and wagmi does not auto-connect. Once connected, it stays authorized for this browser context (localStorage),
  // so navigations and reloads restore the session silently. Pass { connected: true } to start authorized.
  const AUTH = 'demoWallet:authorized'
  let authStored = null
  try { authStored = localStorage.getItem(AUTH) } catch {}
  let connected = cfg.connected === true || authStored === '1'
  const setConnected = (v) => { connected = v; try { localStorage.setItem(AUTH, v ? '1' : '0') } catch {} }
  const listeners = {}
  const log = []
  let rpcId = 1

  const emit = (event, payload) => (listeners[event] || []).slice().forEach((fn) => { try { fn(payload) } catch (e) { console.error(e) } })
  const accounts = () => (connected ? [PERSONAS[persona]] : [])
  const rpcError = (code, message) => Object.assign(new Error(message), { code })

  async function forward(method, params) {
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params: params || [] }),
    })
    const body = await res.json()
    if (body.error) throw Object.assign(new Error(body.error.message || 'RPC error'), { code: body.error.code ?? -32603, data: body.error.data })
    return body.result
  }

  async function handle(method, params) {
    switch (method) {
      case 'eth_chainId': return CHAIN_ID
      case 'net_version': return String(parseInt(CHAIN_ID, 16))
      case 'eth_accounts': return accounts()
      case 'eth_requestAccounts':
        if (!connected) { setConnected(true); emit('connect', { chainId: CHAIN_ID }); emit('accountsChanged', accounts()) }
        return accounts()
      case 'eth_coinbase': return accounts()[0] || null
      case 'wallet_switchEthereumChain': {
        const want = params && params[0] && String(params[0].chainId).toLowerCase()
        if (want && want !== CHAIN_ID) throw rpcError(4902, `Demo Wallet only knows chain ${CHAIN_ID}`)
        return null
      }
      case 'wallet_addEthereumChain': return null
      case 'wallet_watchAsset': return true
      case 'wallet_requestPermissions':
        setConnected(true)
        return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts() }] }]
      case 'wallet_getPermissions':
        return connected ? [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts() }] }] : []
      case 'wallet_revokePermissions':
        setConnected(false)
        emit('accountsChanged', [])
        return null
      case 'wallet_getCapabilities': return {}
      case 'eth_sendTransaction': {
        // Sign as the current persona whatever the dapp put in `from`, and let anvil estimate gas.
        const tx = Object.assign({}, (params && params[0]) || {}, { from: PERSONAS[persona] })
        return forward('eth_sendTransaction', [tx])
      }
      default: return forward(method, params)
    }
  }

  const provider = {
    isDemoWallet: true,
    isMetaMask: false,
    get chainId() { return CHAIN_ID },
    get selectedAddress() { return accounts()[0] || null },
    isConnected: () => true,
    async request({ method, params } = {}) {
      const t0 = performance.now()
      try {
        const r = await handle(method, params)
        log.push({ method, ms: Math.round(performance.now() - t0) })
        return r
      } catch (e) {
        log.push({ method, ms: Math.round(performance.now() - t0), error: e.message })
        throw e
      } finally {
        if (log.length > 200) log.splice(0, log.length - 200)
      }
    },
    // Legacy callback APIs some libraries still probe.
    send(a, b) {
      if (typeof a === 'string') return this.request({ method: a, params: b })
      return this.sendAsync(a, b)
    },
    sendAsync(payload, cb) {
      this.request(payload).then((result) => cb(null, { jsonrpc: '2.0', id: payload.id, result }), (error) => cb(error))
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); return this },
    addListener(event, fn) { return this.on(event, fn) },
    removeListener(event, fn) { listeners[event] = (listeners[event] || []).filter((x) => x !== fn); return this },
    off(event, fn) { return this.removeListener(event, fn) },
    removeAllListeners(event) { if (event) delete listeners[event]; else for (const k in listeners) delete listeners[k]; return this },
    emit(event, payload) { emit(event, payload); return true },
  }

  const ICON = 'data:image/svg+xml;base64,' + btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#0b0b0b"/>' +
    '<path d="M24 34a10 10 0 0 1 10-10h34a4 4 0 0 1 4 4v6H34a10 10 0 0 0-10 10z" fill="#4dfca9" opacity=".55"/>' +
    '<rect x="24" y="34" width="52" height="40" rx="10" fill="#4dfca9"/><circle cx="62" cy="54" r="5" fill="#0b0b0b"/></svg>',
  )
  const info = Object.freeze({ uuid: '6f1d6c3e-5a7b-4d0e-9a51-0d3e4b6a9c11', name: 'Demo Wallet', icon: ICON, rdns: 'sh.kyte.demo' })
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }))

  try {
    Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true })
  } catch { window.ethereum = provider }
  window.addEventListener('eip6963:requestProvider', announce)
  announce()
  window.dispatchEvent(new Event('ethereum#initialized'))

  window.__demoWallet = {
    provider,
    personas: PERSONAS,
    log,
    get persona() { return persona },
    get address() { return PERSONAS[persona] },
    setPersona(name) {
      if (!PERSONAS[name]) throw new Error(`unknown persona ${name}`)
      persona = name
      try { localStorage.setItem(KEY, name) } catch {}
      setConnected(true)
      emit('accountsChanged', accounts())
      return PERSONAS[name]
    },
    disconnect() { setConnected(false); emit('accountsChanged', []) },
  }
})()
