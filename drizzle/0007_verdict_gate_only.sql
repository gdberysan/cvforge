-- 1.2.17 reserved `skip` for a gate — location, timezone, authorization — and
-- removed the count-based path into it, because the count was not reproducible
-- (two eval runs over the same posting and evidence disagreed by enough to
-- cross the old `mandatoryMissing <= 4` line). Rows analysed under the old rule
-- still carry a `skip` that nothing gates, and they now render the gate's
-- explanation, which is simply untrue of them.
--
-- The verdict is derived data — a pure function of requirements and mappings —
-- so it is recomputed here rather than left to misdescribe itself. Only the
-- branch that changed is touched: a `skip` with no hard blockers becomes
-- `stretch`, and every other verdict, including a genuinely gated `skip`, is
-- left exactly as it was. `coalesce` covers a row whose coverage predates the
-- field; `json_valid` covers one that was never computed at all.
UPDATE applications
SET coverage = json_set(coverage, '$.verdict', 'stretch')
WHERE coverage IS NOT NULL
  AND json_valid(coverage)
  AND json_extract(coverage, '$.verdict') = 'skip'
  AND coalesce(json_array_length(json_extract(coverage, '$.hardBlockers')), 0) = 0;
