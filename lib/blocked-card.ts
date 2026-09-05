// Ordinary suggestions need a real action. A blocked result is only an update
// to the existing card for its latest, already-terminal blocked job.
export function cardIngestMode(html: string, blockedJobId?: number, expectedVersion?: number) {
  const hasAction = /data-radar-action\s*=\s*["']do["']/i.test(html);
  if (blockedJobId === undefined) return hasAction ? "actionable" : null;
  const validIdentity = Number.isSafeInteger(blockedJobId) && blockedJobId > 0
    && Number.isSafeInteger(expectedVersion) && Number(expectedVersion) > 0;
  const visiblyBlocked = /data-radar-state\s*=\s*["']blocked["']/i.test(html);
  return validIdentity && visiblyBlocked && !hasAction ? "blocked" : null;
}

export function needsFallbackAction(missingDo: boolean, explicitlyBlocked: boolean, jobOutcome: string | null) {
  return missingDo && !explicitlyBlocked && jobOutcome !== "blocked";
}

// Keep the job relationship and version guard in the write itself. This cannot
// create cards, reopen decisions, overwrite a newer job, or turn blocked into Done.
export const BLOCKED_CARD_UPDATE_SQL = `
  UPDATE ideas SET headline = ?, card_html = ?, agent_context = ?, version = version + 1
  WHERE dedupe_key = ? AND version = ? AND status IN ('new', 'working')
    AND EXISTS (
      SELECT 1 FROM agent_jobs job
      WHERE job.id = ? AND job.idea_id = ideas.id
        AND job.status = 'failed' AND job.ticket_outcome = 'blocked'
        AND NOT EXISTS (
          SELECT 1 FROM agent_jobs newer
          WHERE newer.idea_id = ideas.id AND newer.id > job.id
        )
    )
  RETURNING id, version
`;
