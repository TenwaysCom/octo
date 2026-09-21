export function getEvalStatusLabel(sample) {
  return sample?.datasetStatus === "draft" ? "Draft" : sample?.datasetStatus === "badcase" ? "Bad case" : sample?.datasetStatus === "eval" ? "纳入 Eval" : "未标记";
}

export function getEvalSamplesByTicket(samples, mine = false) {
  const result = new Map();
  for (const sample of samples) {
    if (mine && !sample.isMyEval) continue;
    const key = `${sample.ticket.baseId}:${sample.ticket.tableId}:${sample.ticket.recordId}`;
    const current = result.get(key);
    if (!current || sample.snapshotVersion > current.snapshotVersion ||
      (sample.snapshotVersion === current.snapshotVersion && sample.updatedAt > current.updatedAt)) result.set(key, sample);
  }
  return result;
}
