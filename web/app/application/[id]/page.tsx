import { ApplicationScreen } from './screen'

/**
 * A static site cannot know a person's application ids at build time: one
 * page is built (/application/_/) and the host serves it for every
 * /application/<id> (web/public/_redirects). The screen reads the real id
 * from the address, never from the build-time param.
 */
export function generateStaticParams() {
  return [{ id: '_' }]
}

export default function Page() {
  return <ApplicationScreen />
}
