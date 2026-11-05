import React from 'react'
import { AbsoluteFill, Composition, useCurrentFrame } from 'remotion'
import { C, FPS, H, W } from '../theme'
import { Callout, StepChips, TokenFlow } from './Callout'
import { FakeScreen } from './demo/FakeScreen'
import { KineticTitle } from './KineticTitle'
import { NFT_TOTAL, NftCard } from './NftCard'
import { Outro, OUTRO_FRAMES } from './Outro'
import { Flood } from './transitions/Flood'
import { Iris } from './transitions/Iris'
import { Welcome, WELCOME_FRAMES } from './Welcome'

const KineticDemo = () => (
  <AbsoluteFill>
    <FakeScreen />
    <KineticTitle eyebrow="Step 1 · Sell" title="Sell a *covered call*" enter={10} exit={150} />
  </AbsoluteFill>
)
const KineticCenterDemo = () => <KineticTitle variant="center" backdrop="#000" eyebrow="How it works" title="Fully *collateralised.*" enter={10} exit={150} />

const CalloutDemo = () => (
  <AbsoluteFill>
    <FakeScreen />
    <Callout rect={{ x: 1191, y: 697, w: 578, h: 72 }} label="Collateral locked on-chain" sub="1 NVDA · escrowed" icon="lock" side="top" enter={10} exit={130} />
    <Callout rect={{ x: 1185, y: 322, w: 590, h: 46 }} label="You pay now" sub="0.0042 ETH premium" icon="coin" side="left" enter={140} exit={260} />
    <Callout rect={{ x: 420, y: 330, w: 260, h: 140 }} label="Break-even" sub="$190.42" side="bottom" enter={160} exit={260} outline />
  </AbsoluteFill>
)
const StepsDemo = () => (
  <AbsoluteFill>
    <FakeScreen />
    <StepChips at={[10, 50, 90, 130]} exit={230} />
  </AbsoluteFill>
)
const TokenFlowDemo = () => (
  <AbsoluteFill>
    <FakeScreen />
    <TokenFlow
      enter={10}
      exit={200}
      flows={[
        { from: { x: 560, y: 360 }, to: { x: 1380, y: 300 }, label: 'NVDA → buyer', icon: 'chain', color: C.mint },
        { from: { x: 1380, y: 620 }, to: { x: 560, y: 680 }, label: 'ETH → seller', icon: 'coin', color: '#e8eeeb' },
      ]}
    />
  </AbsoluteFill>
)
const NftDemo = () => (
  <AbsoluteFill>
    <FakeScreen />
    <NftCard from={{ x: 1500, y: 940, w: 380, h: 96 }} to={{ x: 270, y: 20, w: 84, h: 32 }} start={10} />
  </AbsoluteFill>
)
const OutroDemo = () => (
  <Outro>
    <FakeScreen label="last frame of the recording" />
  </Outro>
)
const TransitionsDemo = () => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {frame < 39 ? (
        <FakeScreen label="scene A" />
      ) : (
        <Iris start={100} dur={36} mode="close" origin={{ x: W / 2, y: H / 2 }}>
          <AbsoluteFill style={{ background: '#06100c', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 64 }}>scene B</AbsoluteFill>
        </Iris>
      )}
      {frame < 39 ? <Flood start={20} dur={18} color={C.mint} origin={{ x: 1600, y: 900 }} /> : <Flood start={40} dur={18} color={C.mint} origin={{ x: 1600, y: 900 }} mode="out" />}
    </AbsoluteFill>
  )
}

/** All motion-graphics compositions (for stills and review). Registered once from src/Root.tsx. */
export const MgCompositions: React.FC = () => {
  const c = { fps: FPS, width: W, height: H }
  return (
    <>
      <Composition id="MG-Welcome" component={Welcome} durationInFrames={WELCOME_FRAMES} {...c} defaultProps={{}} />
      <Composition id="MG-Outro" component={OutroDemo} durationInFrames={OUTRO_FRAMES} {...c} />
      <Composition id="MG-KineticTitle" component={KineticDemo} durationInFrames={190} {...c} />
      <Composition id="MG-KineticTitleCenter" component={KineticCenterDemo} durationInFrames={190} {...c} />
      <Composition id="MG-Callout" component={CalloutDemo} durationInFrames={290} {...c} />
      <Composition id="MG-StepChips" component={StepsDemo} durationInFrames={260} {...c} />
      <Composition id="MG-TokenFlow" component={TokenFlowDemo} durationInFrames={230} {...c} />
      <Composition id="MG-NftCard" component={NftDemo} durationInFrames={NFT_TOTAL + 40} {...c} />
      <Composition id="MG-Transitions" component={TransitionsDemo} durationInFrames={150} {...c} />
    </>
  )
}
