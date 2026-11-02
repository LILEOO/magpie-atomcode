/**
 * CodingPlan status → Magpie `auth.usage` mapping.
 *
 * The plan's own fields supply `plan` (套餐名) and `until` (到期时间); every
 * `rate_limit_windows` row is mapped so additional windows from upstream are
 * not silently discarded. `auth.usage` percentages may legitimately exceed 100
 * when the quota is exhausted — Magpie renders that natively.
 *
 * Mapping is a pure function so the shape contract can be tested offline
 * against the real response captured in the plan document (§5.4).
 *
 * @module magpie-atomcode/quota
 */

import { planOf } from "./codingplan.mjs";
import { fill } from "./i18n.mjs";
import { atomInstantISO } from "./internal.mjs";

/** Number if finite (0 included), else undefined. */
export function num(v) {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Used-percentage fallback when the API does not hand one over. */
function pctOf(used, limit) {
  const count = num(used);
  const total = num(limit);
  if (count === undefined || !total) return undefined;
  return (count / total) * 100;
}

function resetOf(raw, fallback) {
  const secs = num(raw?.seconds_until_reset);
  if (secs !== undefined) return { resetSecs: secs };
  const resetsAt = atomInstantISO(raw?.reset_at ?? fallback?.reset_at);
  return resetsAt ? { resetsAt } : {};
}

function tokenWindow(usage, hours, reset, t) {
  const amount = num(usage.window_tokens_used ?? usage.tokens_used);
  const limit = num(usage.window_token_limit ?? usage.token_limit);
  if (amount === undefined || !limit) return undefined;
  const used = num(usage.token_usage_percent) ?? pctOf(amount, limit);
  return {
    name: fill(t.windowTokens, { hours }),
    ...(used !== undefined ? { used } : {}),
    span: hours * 3600,
    amount,
    unit: "tokens",
    limit,
    display: fill(t.tokensOf, { used: amount, total: limit }),
    ...reset,
  };
}

/**
 * Build the `auth.usage` payload from a `status-v2` response.
 *
 * @param {object} status - parsed `status-v2`.
 * @param {object} t - the i18n table for labels.
 * @param {{user?: string}} [context] - the account's display name for the row.
 * @returns {{plan?: string, user?: string, until?: string, windows: object[]}}
 */
export function quotaFromStatus(status, t, { user } = {}) {
  const plan = planOf(status) ?? {};
  const usage = status?.current_usage ?? {};
  const windows = [];

  const rawWindows = Array.isArray(status?.rate_limit_windows)
    ? status.rate_limit_windows.filter((w) => w && typeof w === "object")
    : [];
  const token = tokenWindow(
    usage,
    num(usage.window_hours) ?? 5,
    resetOf(usage),
    t,
  );
  for (const raw of rawWindows) {
    const limit = num(raw.call_limit);
    const amount = num(raw.calls_used);
    const span = num(raw.window_size_seconds) ?? (num(raw.window_hours) ?? 5) * 3600;
    const hours = num(raw.window_hours) ?? Math.round(span / 3600);
    const used = num(raw.usage_percent) ?? pctOf(amount, limit);
    windows.push({
      name: fill(t.windowHours, { hours }),
      ...(used !== undefined ? { used } : {}),
      span,
      ...(amount !== undefined ? { amount } : {}),
      unit: "calls",
      ...(limit ? { limit } : {}),
      ...(limit && amount !== undefined
        ? { display: fill(t.callsOf, { used: amount, total: limit }) }
        : {}),
      ...resetOf(raw, usage),
    });
  }
  if (
    !rawWindows.length &&
    !token &&
    (num(usage.usage_percent) !== undefined || num(usage.window_hours) !== undefined)
  ) {
    // No window row (older shape?): fall back to the current_usage block.
    const hours = num(usage.window_hours) ?? 5;
    const used = num(usage.usage_percent);
    windows.push({
      name: fill(t.windowHours, { hours }),
      ...(used !== undefined ? { used } : {}),
      span: hours * 3600,
      unit: "calls",
      ...resetOf(usage),
    });
  }
  if (token && !rawWindows.some((raw) => num(raw.window_tokens_used ?? raw.tokens_used) !== undefined)) {
    windows.push(token);
  }

  return {
    ...(plan.plan_name ? { plan: plan.plan_name } : { plan: t.planFallback }),
    ...(user ? { user } : {}),
    ...(plan.expires_at
      ? { until: atomInstantISO(plan.expires_at) ?? String(plan.expires_at) }
      : {}),
    windows,
  };
}
