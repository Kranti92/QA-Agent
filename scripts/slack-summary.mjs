#!/usr/bin/env node
/**
 * Turns Playwright's JSON report into GitHub Actions outputs for the Slack
 * message.
 *
 * Run after `playwright test`, with the json reporter having written
 * reports/results.json (see playwright.config.ts).
 *
 *   node scripts/slack-summary.mjs            # writes to $GITHUB_OUTPUT
 *   node scripts/slack-summary.mjs --stdout   # prints, for local checking
 *
 * Outputs: summary, failed_list, throttled, emoji, outcome
 *
 * Two things worth knowing about the counts:
 *
 *  - Our known-defect specs use `test.fail()`. When the defect is still
 *    present they fail as instructed, which Playwright counts under
 *    `expected` — so they are "passed" here. They move to `unexpected` only
 *    when someone fixes the bug, which is exactly the signal we want.
 *  - The store rate-limits /cart/add.js with HTTP 429. That is infrastructure,
 *    not a regression, so it gets its own flag and its own wording rather than
 *    being reported as a product failure.
 */
import { readFileSync, appendFileSync } from 'node:fs';

const REPORT = process.env.PW_JSON_REPORT ?? 'reports/results.json';
const MAX_LISTED = 8;
const THROTTLE_HINTS = ['rate-limited POST /cart/add.js', 'too_many_requests', '429'];

/** Playwright nests suites arbitrarily deep; flatten to specs with a file path. */
function collectSpecs(suites, out = []) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      out.push({ ...spec, file: spec.file ?? suite.file ?? '' });
    }
    collectSpecs(suite.suites, out);
  }
  return out;
}

function errorTextOf(spec) {
  return (spec.tests ?? [])
    .flatMap((t) => t.results ?? [])
    .flatMap((r) => [r.error?.message ?? '', r.error?.stack ?? '', ...(r.errors ?? []).map((e) => e.message ?? '')])
    .join('\n');
}

let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (err) {
  // No report at all means the run died before Playwright wrote one —
  // say so plainly rather than emitting a confident-looking zero.
  emit({
    summary: `Could not read ${REPORT} — the run failed before any results were written.`,
    failed_list: '',
    throttled: 'false',
    emoji: ':boom:',
    outcome: 'error',
  });
  process.exit(0);
}

const stats = report.stats ?? {};
const passed = stats.expected ?? 0;
const failed = stats.unexpected ?? 0;
const flaky = stats.flaky ?? 0;
const skipped = stats.skipped ?? 0;
const seconds = Math.round((stats.duration ?? 0) / 1000);

const specs = collectSpecs(report.suites);
const failedSpecs = specs.filter((s) => s.ok === false);

const allErrors = failedSpecs.map(errorTextOf).join('\n');
const throttled =
  failedSpecs.length > 0 &&
  THROTTLE_HINTS.some((hint) => allErrors.includes(hint));

const parts = [`*${passed}* passed`];
if (failed) parts.push(`*${failed}* failed`);
if (flaky) parts.push(`${flaky} flaky`);
if (skipped) parts.push(`${skipped} skipped`);

let summary = `${parts.join(' · ')} · ${seconds}s`;
if (throttled) {
  summary += '\n:warning: Failures look like the storefront rate-limiting `/cart/add.js` (HTTP 429), not a product regression. Re-run later or lower `workers`.';
}

const failed_list = failedSpecs
  .slice(0, MAX_LISTED)
  .map((s) => `• \`${s.file}:${s.line ?? '?'}\` — ${s.title}`)
  .join('\n')
  + (failedSpecs.length > MAX_LISTED
    ? `\n• …and ${failedSpecs.length - MAX_LISTED} more`
    : '');

const outcome = failed === 0 ? 'success' : throttled ? 'throttled' : 'failure';
const emoji =
  outcome === 'success' ? ':white_check_mark:'
  : outcome === 'throttled' ? ':hourglass_flowing_sand:'
  : ':x:';

emit({ summary, failed_list, throttled: String(throttled), emoji, outcome });

function emit(values) {
  if (process.argv.includes('--stdout') || !process.env.GITHUB_OUTPUT) {
    for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
    return;
  }
  // Multiline values need the heredoc form of $GITHUB_OUTPUT.
  const body = Object.entries(values)
    .map(([k, v]) => `${k}<<__EOF__\n${v}\n__EOF__`)
    .join('\n');
  appendFileSync(process.env.GITHUB_OUTPUT, body + '\n');
}
