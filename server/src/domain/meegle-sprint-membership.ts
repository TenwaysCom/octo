export type MeegleSprintMembershipSource = "historical_inferred" | "incremental_observed";

export interface MeegleSprintMembershipLifecycle {
  phase?: "new" | "started" | "finished";
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
  if (!lifecycle.phase) {
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
  if (lifecycle.phase === "new") return { ...membership, startedAt: null, finishedAt: null };

  const observedStart = clampToMembership(lifecycle.itemStartTime, membership.addedAt);
  const startedAt = earliestTimestamp(membership.startedAt, observedStart);
  if (lifecycle.phase === "started") return { ...membership, startedAt, finishedAt: null };
  return {
    ...membership,
    startedAt,
    finishedAt: lifecycle.itemFinishTime == null
      ? membership.finishedAt
      : clampToMembership(lifecycle.itemFinishTime, membership.addedAt),
  };
}

function clampToMembership(value: string | null | undefined, addedAt: string): string | null {
  if (!value) return null;
  return compareTimestamp(value, addedAt) < 0 ? addedAt : value;
}

function earliestTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return compareTimestamp(left, right) <= 0 ? left : right;
}

function compareTimestamp(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime;
  return left.localeCompare(right);
}
