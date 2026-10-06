#!/usr/bin/env node
/**
 * Turns Playwright's JSON report into a Slack message.
 *
 * Run after `playwright test`, with the json reporter having written
 * reports/results.json (see playwright.config.ts).
 *
 *   node scripts/slack-summary.mjs --payload > reports/slack-payload.json
 *   node scripts/slack-summary.mjs --outputs      # GitHub Actions $GITHUB_OUTPUT
 *   node scripts/slack-summary.mjs --stdout       # human-readable, for local checks
 *
 * `--payload` writes a complete chat.postMessage body, so the CI step is a
 * plain `curl` rather than an orb or action whose templating we cannot test
 * locally. The channel comes from SLACK_CHANNEL (or SLACK_DEFAULT_CHANNEL).
 *
 * Two things worth knowing about the counts:
 *
 *  - Our known-defect specs use `test.fail()`. While the defect is present
 *    they fail as instructed, which Playwright counts under `expected` — so
 *    they read as passing here. They move to `unexpected` only when someone
 *    fixes the bug, which is exactly the signal we want.
 *  - The storefront rate-limits /cart/add.js with HTTP 429. That is
 *    infrastructure, not a regression, so it gets its own outcome and its own
 *    wording instead of being reported as a product failure.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved relative to this script's own location, not the caller's CWD, so
// `node automation/scripts/slack-summary.mjs` works the same whether it's
// run from the repo root or from inside automation/ - no `cd` required. A
// qa-reporter skill invocation that did `cd automation && node
// scripts/slack-summary.mjs` once fell outside its Bash permission
// allowlist for exactly this reason (the allowlist matches the literal
// command, which then started with `cd`, not `node`) - this removes the
// need for the `cd` that caused it.
const here = dirname(fileURLToPath(import.meta.url));
const REPORT = process.env.PW_JSON_REPORT ?? resolve(here, '..', 'reports', 'results.json');
const MAX_LISTED = 8;
const THROTTLE_HINTS = ['rate-limited POST /cart/add.js', 'too_many_requests', '429'];

const MODE = process.argv.includes('--payload')
  ? 'payload'
  : process.argv.includes('--outputs')
    ? 'outputs'
    : 'stdout';

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
    .flatMap((r) => [
      r.error?.message ?? '',
      r.error?.stack ?? '',
      ...(r.errors ?? []).map((e) => e.message ?? ''),
    ])
    .join('\n');
}

function analyse() {
  let report;
  try {
    report = JSON.parse(readFileSync(REPORT, 'utf8'));
  } catch {
    // No report means the run died before Playwright wrote one. Say so
    // plainly rather than emitting a confident-looking zero.
    return {
      summary: `Could not read \`${REPORT}\` — the run failed before any results were written.`,
      failed_list: '',
      throttled: false,
      emoji: ':boom:',
      outcome: 'error',
    };
  }

  const stats = report.stats ?? {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const flaky = stats.flaky ?? 0;
  const skipped = stats.skipped ?? 0;
  const seconds = Math.round((stats.duration ?? 0) / 1000);

  const failedSpecs = collectSpecs(report.suites).filter((s) => s.ok === false);
  const allErrors = failedSpecs.map(errorTextOf).join('\n');
  const throttled =
    failedSpecs.length > 0 && THROTTLE_HINTS.some((h) => allErrors.includes(h));

  const parts = [`*${passed}* passed`];
  if (failed) parts.push(`*${failed}* failed`);
  if (flaky) parts.push(`${flaky} flaky`);
  if (skipped) parts.push(`${skipped} skipped`);

  let summary = `${parts.join(' · ')} · ${seconds}s`;
  if (throttled) {
    summary +=
      '\n:warning: These failures match the storefront rate-limiting ' +
      '`/cart/add.js` (HTTP 429), not a product regression. Re-run later or lower `workers`.';
  }

  const failed_list =
    failedSpecs
      .slice(0, MAX_LISTED)
      .map((s) => `• \`${s.file}:${s.line ?? '?'}\` — ${s.title}`)
      .join('\n') +
    (failedSpecs.length > MAX_LISTED
      ? `\n• …and ${failedSpecs.length - MAX_LISTED} more`
      : '');

  const outcome = failed === 0 ? 'success' : throttled ? 'throttled' : 'failure';
  const emoji =
    outcome === 'success'
      ? ':white_check_mark:'
      : outcome === 'throttled'
        ? ':hourglass_flowing_sand:'
        : ':x:';

  return { summary, failed_list, throttled, emoji, outcome };
}

/**
 * CI-agnostic run metadata. CircleCI and GitHub Actions expose different
 * variables, so resolve both rather than coupling the script to one.
 */
function runContext() {
  const circleBuild = process.env.CIRCLE_BUILD_URL;
  if (circleBuild) {
    return {
      provider: 'CircleCI',
      runUrl: circleBuild,
      // Artifacts live on the job's own tab. Linking there avoids having to
      // query the artifacts API just to build a URL.
      reportUrl: `${circleBuild}#artifacts/containers/0/`,
      ref: process.env.CIRCLE_BRANCH || process.env.CIRCLE_TAG || 'unknown',
      number: process.env.CIRCLE_BUILD_NUM ?? '',
    };
  }

  const server = process.env.GITHUB_SERVER_URL;
  if (server && process.env.GITHUB_RUN_ID) {
    const runUrl = `${server}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    return {
      provider: 'GitHub Actions',
      runUrl,
      reportUrl: process.env.REPORT_URL || runUrl,
      ref: process.env.GITHUB_REF_NAME ?? 'unknown',
      number: process.env.GITHUB_RUN_NUMBER ?? '',
    };
  }

  return { provider: 'local', runUrl: '', reportUrl: '', ref: 'local', number: '' };
}

function buildPayload(result) {
  const ctx = runContext();
  const channel = process.env.SLACK_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || '';
  const suite = process.env.SUITE || 'smoke';
  const triggeredBy = process.env.TRIGGERED_BY || '';

  const context = [`\`${ctx.ref}\``, ctx.provider];
  if (ctx.number) context.push(`#${ctx.number}`);
  if (triggeredBy) context.push(`by ${triggeredBy}`);

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${result.emoji} *QA Suite — ${suite}*\n${result.summary}`,
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: context.join(' · ') }],
    },
  ];

  if (result.failed_list) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Failed specs*\n${result.failed_list}` },
    });
  }

  // Slack rejects a button with an empty url, so only add what we have.
  const buttons = [];
  if (ctx.reportUrl) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'HTML report' },
      url: ctx.reportUrl,
    });
  }
  if (ctx.runUrl) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Run log' },
      url: ctx.runUrl,
    });
  }
  if (buttons.length) blocks.push({ type: 'actions', elements: buttons });

  return {
    channel,
    // Fallback text for notifications and screen readers.
    text: `${result.emoji} QA Suite (${suite}): ${result.outcome}`,
    blocks,
  };
}

const result = analyse();

if (MODE === 'payload') {
  process.stdout.write(JSON.stringify(buildPayload(result), null, 2) + '\n');
} else if (MODE === 'outputs' && process.env.GITHUB_OUTPUT) {
  // Multiline values need the heredoc form of $GITHUB_OUTPUT.
  const body = Object.entries({ ...result, throttled: String(result.throttled) })
    .map(([k, v]) => `${k}<<__EOF__\n${v}\n__EOF__`)
    .join('\n');
  appendFileSync(process.env.GITHUB_OUTPUT, body + '\n');
} else {
  for (const [k, v] of Object.entries(result)) console.log(`${k}=${v}`);
}

// Exit code mirrors the outcome so a CI step can gate on it: throttling is
// deliberately not a failure.
if (process.argv.includes('--exit-code')) {
  process.exit(result.outcome === 'failure' || result.outcome === 'error' ? 1 : 0);
}
