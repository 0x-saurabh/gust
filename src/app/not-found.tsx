import type { Metadata } from 'next'
import { NotFoundScene } from '@/components/notfound/NotFoundScene'

export const metadata: Metadata = { title: 'Not found · Kyte', robots: { index: false } }

export default function NotFound() {
  return <NotFoundScene />
}
