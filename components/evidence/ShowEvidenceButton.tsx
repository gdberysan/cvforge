'use client'

/** Asks the evidence list to show one filter and brings it into view. */
export const EVIDENCE_FILTER_EVENT = 'cvforge:evidence-filter'

export function ShowEvidenceButton({ filter, label }: { filter: string; label: string }) {
  return (
    <button
      type="button"
      className="btn btn-primary strength-act"
      onClick={() =>
        window.dispatchEvent(new CustomEvent(EVIDENCE_FILTER_EVENT, { detail: filter }))
      }
    >
      {label}
    </button>
  )
}

/** Asks the profile card to open its form at one part ("titles", "summary", "skills"). */
export const EDIT_DETAILS_EVENT = 'cvforge:edit-details'

/** Opens the profile card's form where a strength fix is made. */
export function EditDetailsButton({
  part,
  label,
  quiet = false,
}: {
  part: string
  label: string
  quiet?: boolean
}) {
  return (
    <button
      type="button"
      className={quiet ? 'action action-inline' : 'btn btn-primary strength-act'}
      onClick={() => window.dispatchEvent(new CustomEvent(EDIT_DETAILS_EVENT, { detail: part }))}
    >
      {label}
    </button>
  )
}
