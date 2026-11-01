// Devnet check: KyteHook fees landing in the FeeVault from live swaps on the hooked $KYTE pool.
import fs from 'node:fs'
import { createPublicClient, formatEther, http, parseAbiItem } from 'viem'
const dep = JSON.parse(fs.readFileSync('contracts/deployments/31337.json', 'utf8'))
const c = createPublicClient({ transport: http('http://127.0.0.1:8547') })
const erc20 = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }]
const bal = () => c.readContract({ address: dep.weth, abi: erc20, functionName: 'balanceOf', args: [dep.feeVault] })
const b0 = await bal()
await new Promise((r) => setTimeout(r, 30000))
const b1 = await bal()
const logs = await c.getLogs({ address: dep.kyteHook, event: parseAbiItem('event HookFee(bytes32 indexed id, address indexed currency, uint256 amount)'), fromBlock: 0n })
const total = logs.reduce((a, l) => a + l.args.amount, 0n)
console.log(JSON.stringify({ hook: dep.kyteHook, hookFeeEvents: logs.length, totalHookFeeWeth: formatEther(total), vaultWethBefore: formatEther(b0), vaultWethAfter30s: formatEther(b1) }))
