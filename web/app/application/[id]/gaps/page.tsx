import { GapsScreen } from './screen'

/** One page built for every application id (see web/lib/route-id.ts). */
export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function Page() {
  return <GapsScreen />
}
