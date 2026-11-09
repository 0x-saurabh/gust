// Merkle trees in OpenZeppelin's StandardMerkleTree shape, so UsdgRewards.claim (MerkleProof.verifyCalldata, sorted
// pairs) accepts the proofs: leaf = keccak256(bytes.concat(keccak256(abi.encode(...values)))), nodes = keccak256 of
// the two children in ascending order. An odd node is carried up unhashed (the proof just skips that level), which
// verifies the same way.
import { concatHex, encodeAbiParameters, keccak256 } from 'viem'

export const leafHash = (types, values) => keccak256(concatHex([keccak256(encodeAbiParameters(types, values))]))
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
export const hashPair = (a, b) => (cmp(a, b) <= 0 ? keccak256(concatHex([a, b])) : keccak256(concatHex([b, a])))

/** @param leaves hex leaf hashes; returns { root, proofOf(leaf) -> hex[] } */
export function buildTree(leaves) {
  if (!leaves.length) return { root: null, proofOf: () => [] }
  const level0 = [...new Set(leaves.map((l) => l.toLowerCase()))].sort(cmp)
  const levels = [level0]
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1)
    const next = []
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i], prev[i + 1]) : prev[i])
    levels.push(next)
  }
  const root = levels.at(-1)[0]
  function proofOf(leaf) {
    let idx = level0.indexOf(leaf.toLowerCase())
    if (idx < 0) return null
    const proof = []
    for (let d = 0; d < levels.length - 1; d++) {
      const lvl = levels[d]
      const sib = idx % 2 === 0 ? idx + 1 : idx - 1
      if (sib < lvl.length) proof.push(lvl[sib])
      idx = Math.floor(idx / 2)
    }
    return proof
  }
  return { root, proofOf }
}

/** Mirrors MerkleProof.processProof: fold the proof with sorted-pair hashing. */
export function verify(proof, root, leaf) {
  let h = leaf.toLowerCase()
  for (const p of proof) h = hashPair(h, p)
  return h.toLowerCase() === String(root).toLowerCase()
}
