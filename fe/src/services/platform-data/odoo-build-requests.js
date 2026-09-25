import { getGitHubPullRequestOdooShBuild } from "./platform-data-api.js";

// One request/polling sequence per API origin + PR + head branch in this tab.
export function createOdooBuildRequests({
  load = getGitHubPullRequestOdooShBuild,
  now = Date.now,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  const entries = new Map();
  const retentionMs = 30_000;
  const maxAttempts = 6;

  function publish(entry, value) {
    entry.value = value;
    for (const listener of entry.listeners) listener(value);
  }

  function finish(entry, value) {
    entry.expiresAt = now() + retentionMs;
    publish(entry, value);
  }

  async function poll(entry) {
    const generation = entry.generation;
    entry.timer = undefined;
    entry.pending = true;
    entry.attempts += 1;
    try {
      const result = await load(entry.input);
      if (entry.generation !== generation) return;
      if (result.state === "refreshing") {
        if (entry.attempts >= maxAttempts) {
          finish(entry, { status: "unavailable", builds: [] });
        } else {
          publish(entry, { status: "refreshing", builds: [] });
          entry.nextAt = now() + Math.min(8_000, Math.max(result.retryAfterMs || 1_000, 1_000 * 2 ** (entry.attempts - 1)));
        }
      } else {
        finish(entry, {
          status: result.stale ? "stale" : "ready",
          builds: result.build ? [{ environment: result.environment, status: result.build.status, result: result.build.result }] : [],
        });
      }
    } catch {
      if (entry.generation === generation) finish(entry, { status: "unavailable", builds: [] });
    } finally {
      if (entry.generation === generation) {
        entry.pending = false;
        if (!entry.listeners.size && !entry.expiresAt) finish(entry, { status: "unavailable", builds: [] });
        resume(entry);
      }
    }
  }

  function resume(entry) {
    if (!entry.listeners.size || entry.pending || entry.timer !== undefined || entry.expiresAt) return;
    entry.timer = schedule(() => { void poll(entry); }, Math.max(0, entry.nextAt - now()));
  }

  return {
    invalidate(apiBaseUrl) {
      for (const [key, entry] of entries) {
        if (entry.input.apiBaseUrl !== apiBaseUrl) continue;
        cancel(entry.timer);
        entry.generation += 1;
        if (!entry.listeners.size) {
          entries.delete(key);
          continue;
        }
        Object.assign(entry, { pending: false, timer: undefined, attempts: 0, expiresAt: 0, nextAt: now() });
        publish(entry, { status: "loading", builds: [] });
        resume(entry);
      }
    },
    subscribe(input, listener) {
      for (const [key, entry] of entries) {
        if (!entry.listeners.size && !entry.pending && entry.expiresAt <= now()) entries.delete(key);
      }
      const key = JSON.stringify([input.apiBaseUrl, input.owner.toLowerCase(), input.repo.toLowerCase(), input.pullNumber, input.headRef || ""]);
      let entry = entries.get(key);
      if (!entry) {
        entry = { input, listeners: new Set(), generation: 0, attempts: 0, pending: false, timer: undefined,
          nextAt: now(), expiresAt: 0, value: { status: "loading", builds: [] } };
        entries.set(key, entry);
      } else if (entry.expiresAt && entry.expiresAt <= now()) {
        Object.assign(entry, { attempts: 0, expiresAt: 0, nextAt: now() });
        publish(entry, { status: "loading", builds: [] });
      }
      entry.listeners.add(listener);
      listener(entry.value);
      resume(entry);
      return () => {
        entry.listeners.delete(listener);
        if (!entry.listeners.size && entry.timer !== undefined) {
          cancel(entry.timer);
          entry.timer = undefined;
          // No mounted consumers: stop polling and retain a short cooldown.
          if (!entry.attempts) entries.delete(key);
          else finish(entry, { status: "unavailable", builds: [] });
        }
      };
    },
  };
}

export const odooBuildRequests = createOdooBuildRequests();
