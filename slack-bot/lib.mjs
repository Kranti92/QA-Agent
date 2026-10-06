/**
 * Shared logic for the Slack relay: command parsing and CI dispatch.
 *
 * Imported by both entry points so the two cannot drift apart:
 *   local-bot.mjs  — Socket Mode, runs on your machine (the active path)
 *   worker.js      — Cloudflare Worker, HTTP slash command (optional)
 *
 * Uses only `fetch`, which exists in both Node 18+ and Workers.
 */

export const SUITES = ['smoke', 'regression', 'anomaly', 'data', 'all'];

const MIN_WORKERS = 1;
// The storefront rate-limits /cart/add.js, so the cap is deliberate.
const MAX_WORKERS = 4;

export const HELP_TEXT =
  '*Usage:* `/qa [suite] [workers]`\n' +
  `*Suites:* ${SUITES.map((s) => `\`${s}\``).join(', ')} (default \`smoke\`)\n` +
  `*Workers:* ${MIN_WORKERS}–${MAX_WORKERS}, default 1. Keep it low — the ` +
  'storefront rate-limits `/cart/add.js` with HTTP 429.';

/**
 * Parses `/qa`, `/qa regression`, `/qa regression 2`, `/qa help`.
 * Returns either { suite, workers } or { error }.
 */
export function parseCommand(text) {
  const trimmed = (text ?? '').trim();

  if (trimmed === 'help' || trimmed === '?') return { error: HELP_TEXT };

  const [rawSuite = 'smoke', rawWorkers = '1'] = trimmed.split(/\s+/).filter(Boolean);

  const suite = rawSuite.toLowerCase();
  if (!SUITES.includes(suite)) {
    return {
      error:
        `Unknown suite \`${rawSuite}\`. Pick one of ` +
        `${SUITES.map((s) => `\`${s}\``).join(', ')}, or run \`/qa help\`.`,
    };
  }

  const workers = Number(rawWorkers);
  if (!Number.isInteger(workers) || workers < MIN_WORKERS || workers > MAX_WORKERS) {
    return {
      error: `\`workers\` must be a whole number from ${MIN_WORKERS} to ${MAX_WORKERS}, got \`${rawWorkers}\`.`,
    };
  }

  return { suite, workers: String(workers) };
}

/**
 * CircleCI API v2 pipeline trigger.
 *
 * The parameters must already be declared in .circleci/config.yml or CircleCI
 * answers 400 — that is the usual cause of a failure here.
 *
 * @returns {Promise<{number: number, id: string}>} the created pipeline
 */
export async function dispatchCircleCI(cfg, { suite, workers, channelId, userName }) {
  if (!cfg.projectSlug) throw new Error('CIRCLE_PROJECT_SLUG is not configured');
  if (!cfg.token) throw new Error('CIRCLE_TOKEN is not configured');

  const response = await fetch(
    `https://circleci.com/api/v2/project/${cfg.projectSlug}/pipeline`,
    {
      method: 'POST',
      headers: {
        'Circle-Token': cfg.token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        branch: cfg.ref ?? 'main',
        parameters: {
          suite,
          workers,
          slack_channel: channelId ?? '',
          triggered_by: userName ?? '',
        },
      }),
    },
  );

  const body = await response.text();

  // 201 Created is the success case for a pipeline trigger.
  if (response.status !== 201) {
    throw new Error(`CircleCI returned ${response.status}: ${body.slice(0, 200)}`);
  }

  try {
    const { number, id } = JSON.parse(body);
    return { number, id };
  } catch {
    return { number: 0, id: '' };
  }
}

/** GitHub Actions workflow_dispatch, for the optional hosted path. */
export async function dispatchGitHub(cfg, { suite, workers, channelId, userName }) {
  const response = await fetch(
    `https://api.github.com/repos/${cfg.repo}/actions/workflows/${cfg.workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'qa-agent-slack-relay',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: cfg.ref ?? 'main',
        inputs: {
          suite,
          workers,
          slack_channel: channelId ?? '',
          triggered_by: userName ?? '',
        },
      }),
    },
  );

  // 204 No Content is the success case for workflow_dispatch.
  if (response.status !== 204) {
    const body = await response.text();
    throw new Error(`GitHub returned ${response.status}: ${body.slice(0, 200)}`);
  }
  return { number: 0, id: '' };
}

/** Builds the in-channel acknowledgement for a started run. */
export function ackText({ userName, suite, workers, pipelineNumber }) {
  const which = pipelineNumber ? ` (pipeline #${pipelineNumber})` : '';
  return (
    `:rocket: *${userName}* started the *${suite}* suite ` +
    `with ${workers} worker${workers === '1' ? '' : 's'}${which}. ` +
    'Results will post here when it finishes.'
  );
}
