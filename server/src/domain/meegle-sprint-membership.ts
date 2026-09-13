export type MeegleSprintMembershipSource = "historical_inferred" | "incremental_observed";

export interface MeegleSprintMembershipLifecycle {
  addToCycleTime?: string;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
}

export interface MeegleSprintRelationObservation {
  present: boolean;
  sprintId?: string;
  sprintName?: string;
}

export interface MeegleCurrentSprintSnapshot {
  sprintId?: string | null;
  sprintName?: string | null;
  addToCycleTime?: string | null;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
}

export interface MeegleSprintMembershipState {
  sprintId: string;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  source: MeegleSprintMembershipSource;
}

export interface MeegleSprintMembershipTransition {
  closeOpenAt?: string;
  updateOpen?: MeegleSprintMembershipState;
  createClosed?: MeegleSprintMembershipState & { removedAt: string };
  createOpen?: MeegleSprintMembershipState;
  currentOpen?: MeegleSprintMembershipState;
}

export function projectMeegleSprintMembershipTransition(input: {
  currentSnapshot?: MeegleCurrentSprintSnapshot;
  openMembership?: MeegleSprintMembershipState;
  relation?: MeegleSprintRelationObservation;
  lifecycle?: MeegleSprintMembershipLifecycle;
  observedAt: string;
}): MeegleSprintMembershipTransition {
  const { currentSnapshot, openMembership, relation, lifecycle, observedAt } = input;
  if (relation?.present && !relation.sprintId) {
    if (openMembership) return { closeOpenAt: observedAt };
    const inferred = inferMembershipFromSnapshot(currentSnapshot, undefined, observedAt);
    return inferred ? { createClosed: { ...inferred, removedAt: observedAt } } : {};
  }

  const targetSprintId = relation?.present
    ? relation.sprintId
    : openMembership?.sprintId ?? currentSnapshot?.sprintId ?? undefined;
  if (!targetSprintId) return {};

  if (openMembership?.sprintId === targetSprintId) {
    const updated = applyLifecycle(openMembership, lifecycle);
    return { updateOpen: updated, currentOpen: updated };
  }

  if (openMembership) {
    const created = createObservedMembership(targetSprintId, lifecycle, observedAt);
    return { closeOpenAt: observedAt, createOpen: created, currentOpen: created };
  }

  const sameAsSnapshot = currentSnapshot?.sprintId === targetSprintId
    || Boolean(
      !currentSnapshot?.sprintId
      && currentSnapshot?.sprintName
      && relation?.sprintName
      && currentSnapshot.sprintName === relation.sprintName,
    );
  if (sameAsSnapshot) {
    const inferred = inferMembershipFromSnapshot(
      { ...currentSnapshot, sprintId: targetSprintId },
      lifecycle,
      observedAt,
    );
    return inferred ? { createOpen: inferred, currentOpen: inferred } : {};
  }

  const previous = inferMembershipFromSnapshot(currentSnapshot, undefined, observedAt);
  const created = createObservedMembership(targetSprintId, lifecycle, observedAt);
  return {
    ...(previous ? { createClosed: { ...previous, removedAt: observedAt } } : {}),
    createOpen: created,
    currentOpen: created,
  };
}

function inferMembershipFromSnapshot(
  snapshot: MeegleCurrentSprintSnapshot | undefined,
  lifecycle: MeegleSprintMembershipLifecycle | undefined,
  observedAt: string,
): MeegleSprintMembershipState | undefined {
  if (!snapshot?.sprintId) return undefined;
  const addedAt = snapshot.addToCycleTime ?? lifecycle?.addToCycleTime ?? observedAt;
  return applyLifecycle({
    sprintId: snapshot.sprintId,
    addedAt,
    startedAt: clampToMembership(snapshot.itemStartTime, addedAt),
    finishedAt: clampToMembership(snapshot.itemFinishTime, addedAt),
    source: "historical_inferred",
  }, lifecycle);
}

function createObservedMembership(
  sprintId: string,
  lifecycle: MeegleSprintMembershipLifecycle | undefined,
  observedAt: string,
): MeegleSprintMembershipState {
  return applyLifecycle({
    sprintId,
    addedAt: observedAt,
    startedAt: null,
    finishedAt: null,
    source: "incremental_observed",
  }, lifecycle);
}

function applyLifecycle(
  membership: MeegleSprintMembershipState,
  lifecycle: MeegleSprintMembershipLifecycle | undefined,
): MeegleSprintMembershipState {
  if (!lifecycle) return membership;
  return {
    ...membership,
    startedAt: lifecycle.itemStartTime === undefined
      ? membership.startedAt
      : clampToMembership(lifecycle.itemStartTime, membership.addedAt),
    finishedAt: lifecycle.itemFinishTime === undefined
      ? membership.finishedAt
      : clampToMembership(lifecycle.itemFinishTime, membership.addedAt),
  };
}

function clampToMembership(value: string | null | undefined, addedAt: string): string | null {
  if (!value) return null;
  return compareTimestamp(value, addedAt) < 0 ? addedAt : value;
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime;
  return left.localeCompare(right);
}

export interface MeegleInferredCurrentMembershipInput {
  sprintId: string;
  addToCycleTime?: string | null;
  workitemCreatedAt?: string | null;
  sprintStartAt?: string | null;
  itemStartTime?: string | null;
  itemFinishTime?: string | null;
}

export function buildInferredCurrentMembership(
  input: MeegleInferredCurrentMembershipInput,
): MeegleSprintMembershipState | undefined {
  if (!input.sprintId) return undefined;
  const addedAt = input.addToCycleTime || laterTimestamp(input.workitemCreatedAt, input.sprintStartAt);
  if (!addedAt) return undefined;
  return {
    sprintId: input.sprintId,
    addedAt,
    startedAt: clampToMembership(input.itemStartTime, addedAt),
    finishedAt: clampToMembership(input.itemFinishTime, addedAt),
    source: "historical_inferred",
  };
}

function laterTimestamp(left: string | null | undefined, right: string | null | undefined): string | undefined {
  if (!left) return right || undefined;
  if (!right) return left;
  return compareTimestamp(left, right) >= 0 ? left : right;
}

export type MeegleSprintWorkitemClass = "carryover" | "planned" | "after_cycle" | "unknown";

export interface MeegleSprintMembershipClassification {
  membershipClass: MeegleSprintWorkitemClass;
  estimated: boolean;
  carriedOverFromSprintId?: string;
}

export interface MeegleSprintClassifiedSegment {
  sprintId: string;
  addedAt?: string | null;
  finishedAt?: string | null;
  source: MeegleSprintMembershipSource;
}

export interface MeegleSprintClassSpan {
  startAt?: string | null;
  endAt?: string | null;
}

const PLANNED_ENTRY_GRACE_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_CLASSIFICATION: MeegleSprintMembershipClassification = { membershipClass: "unknown", estimated: false };

export function classifyMeegleSprintMembership(
  segments: MeegleSprintClassifiedSegment[],
  index: number,
  getSprintSpan: (sprintId: string) => MeegleSprintClassSpan | undefined,
): MeegleSprintMembershipClassification {
  const current = segments[index];
  if (!current) return UNKNOWN_CLASSIFICATION;
  const currentSpan = getSprintSpan(current.sprintId);
  const prior = mostRecentPriorSprintSegment(segments, index);
  if (prior) {
    const priorSpan = getSprintSpan(prior.sprintId);
    if (!canDeriveCarryover(prior, priorSpan, currentSpan)) return UNKNOWN_CLASSIFICATION;
    if (unfinishedAtSprintEnd(prior.finishedAt, priorSpan?.endAt)) {
      return {
        membershipClass: "carryover",
        estimated: false,
        carriedOverFromSprintId: prior.sprintId,
      };
    }
  }
  const addedAt = parseClassTimestamp(current.addedAt);
  const startAt = parseClassTimestamp(currentSpan?.startAt);
  if (addedAt === undefined || startAt === undefined) return UNKNOWN_CLASSIFICATION;
  const estimated = current.source === "historical_inferred";
  return addedAt <= startAt + PLANNED_ENTRY_GRACE_MS
    ? { membershipClass: "planned", estimated }
    : { membershipClass: "after_cycle", estimated };
}

function mostRecentPriorSprintSegment(
  segments: MeegleSprintClassifiedSegment[],
  index: number,
): MeegleSprintClassifiedSegment | undefined {
  for (let before = index - 1; before >= 0; before--) {
    if (segments[before].sprintId !== segments[index].sprintId) return segments[before];
  }
  return undefined;
}

function canDeriveCarryover(
  prior: MeegleSprintClassifiedSegment,
  priorSpan: MeegleSprintClassSpan | undefined,
  currentSpan: MeegleSprintClassSpan | undefined,
): boolean {
  return prior.source === "incremental_observed"
    && Boolean(priorSpan?.endAt)
    && Boolean(currentSpan?.startAt)
    && Boolean(currentSpan?.endAt);
}

function unfinishedAtSprintEnd(finishedAt: string | null | undefined, sprintEndAt: string | null | undefined): boolean {
  const sprintEnd = endOfUtcDayValue(sprintEndAt);
  if (sprintEnd === undefined) return false;
  const finished = parseClassTimestamp(finishedAt);
  return finished === undefined || finished > sprintEnd;
}

function parseClassTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function endOfUtcDayValue(value: string | null | undefined): number | undefined {
  const parsed = parseClassTimestamp(value);
  if (parsed === undefined) return undefined;
  const date = new Date(parsed);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1;
}
