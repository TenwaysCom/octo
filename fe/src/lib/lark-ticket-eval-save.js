export function initialEvalDraft(sample) {
  return { datasetStatus: sample.datasetStatus, manualIntent: sample.manualIntent || "", expectedOutcome: sample.expectedOutcome || "",
    notes: sample.notes || "", failureLabels: sample.failureLabels || [] };
}

export function createEvalSaveAttempt(newId = () => crypto.randomUUID()) {
  let previous;
  let actionRunId;
  return (payload) => {
    const fingerprint = JSON.stringify(payload);
    if (previous !== fingerprint) { previous = fingerprint; actionRunId = newId(); }
    return { ...payload, actionRunId };
  };
}

export function mergeEvalDraft(draft, before, after) {
  const old = initialEvalDraft(before), next = initialEvalDraft(after);
  return Object.fromEntries(Object.keys(draft).map((key) => [key,
    key !== "datasetStatus" && JSON.stringify(draft[key]) === JSON.stringify(old[key]) ? next[key] : draft[key]]));
}

export function getFrozenEvalTicket(sample) {
  return sample.source === "shadow" ? { shadowAi: sample.aiOutput?.shadowAi }
    : { ticketAi: { fields: sample.aiOutput || {} } };
}
