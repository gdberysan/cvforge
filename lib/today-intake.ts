/**
 * Whether this visit to Today came to analyse something: a posting handed
 * over by Discover (?li=) or the sample (?sample=1). On a phone the analysis
 * box is otherwise left to the Analizar tab, so these visits must show it —
 * and first — or the hand-off lands on a screen with nothing to act on.
 */
export function intakeRequested(params: { li?: string; sample?: string }): boolean {
  return Boolean(params.li) || params.sample === '1'
}
