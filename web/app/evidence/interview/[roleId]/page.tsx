import { InterviewScreen } from './screen'

/** One page built for every role id (see web/lib/route-id.ts). */
export function generateStaticParams() {
  return [{ roleId: '_' }]
}

export default function Page() {
  return <InterviewScreen />
}
