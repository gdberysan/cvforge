import { redirect } from 'next/navigation'

/**
 * Triage is the home page now — pasting a posting is the app's one gesture,
 * not a section you navigate to. Kept so older links still land somewhere.
 */
export default function TriagePage() {
  redirect('/')
}
