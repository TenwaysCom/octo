export function getEvalStatusLabel(sample) {
  return sample?.datasetStatus === "draft" ? "Draft" : sample?.datasetStatus === "badcase" ? "Bad case" : sample?.datasetStatus === "eval" ? "纳入 Eval" : "未标记";
}

export function getEvalSamplesByTicket(samples, mine = false) {
  const result = new Map();
  for (const sample of samples) {
    if (mine && !sample.isMyEval) continue;
    const key = `${sample.ticket.baseId}:${sample.ticket.tableId}:${sample.ticket.recordId}`;
    const current = result.get(key);
    const versionTime = (value) => value.aiOutput?.shadowAi?.analyzedAt || value.createdAt || "";
    if (!current || sample.snapshotVersion > current.snapshotVersion ||
      (sample.snapshotVersion === current.snapshotVersion && (versionTime(sample) > versionTime(current) ||
        (versionTime(sample) === versionTime(current) && sample.updatedAt > current.updatedAt)))) result.set(key, sample);
  }
  return result;
}

export function getCurrentEvalSample(samples, ticket) {
  const shadowVersion = ticket.shadowAi?.status === "ok" ? ticket.shadowAi.evalVersion : undefined;
  const matching = samples.filter((sample) => ["baseId", "tableId", "recordId"].every((key) => sample.ticket[key] === ticket[key]));
  return shadowVersion ? matching.find((sample) => sample.source === "shadow" && sample.outputVersion === shadowVersion)
    : getEvalSamplesByTicket(matching.filter((sample) => sample.source !== "shadow")).get(`${ticket.baseId}:${ticket.tableId}:${ticket.recordId}`);
}
