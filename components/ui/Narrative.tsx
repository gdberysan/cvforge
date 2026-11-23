/** The sentence a screen opens with. The caller builds it from data; this only sets it. */
export function Narrative({ children }: { children: string }) {
  return <p className="narrative">{children}</p>
}
