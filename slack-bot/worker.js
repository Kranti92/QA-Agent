/**
 * Slack -> GitHub Actions relay (Cloudflare Worker).
 *
 * Why this exists: a Slack slash command POSTs a form-encoded body with its
 * own signature headers. GitHub's API accepts neither, and the official
 * GitHub Slack app can only *subscribe* to workflow events — it cannot
 * dispatch them. So something has to translate, and it has to be reachable
 * from the internet.
 *
 * Flow:
 *   /qa smoke  ->  verify Slack signature
 *              ->  POST /actions/workflows/qa.yml/dispatches
 *              ->  reply within 3s so Slack does not show a timeout
 *   ...the workflow itself posts the result later via chat.postMessage.
 *
 * Secrets (wrangler secret put <NAME>):
 *   SLACK_SIGNING_SECRET  from the Slack app's Basic Information page
 *   GITHUB_TOKEN          fine-grained PAT, repo-scoped, Actions: write
 *
 * Vars (wrangler.toml):
 *   GITHUB_REPO           e.g. Kranti92/QA-Agent
 *   WORKFLOW_FILE         qa.yml
 *   DEFAULT_REF           main
 */

const SUITES = ['smoke', 'regression', 'anomaly', 'data', 'all'];
const MAX_SKEW_SECONDS = 60 * 5;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }

    const raw = await request.text();

    const verification = await verifySlack(request, raw, env.SLACK_SIGNING_SECRET);
    if (!verification.ok) {
      // Do not leak which check failed.
      console.log('rejected slack request:', verification.reason);
      return new Response('unauthorized', { status: 401 });
    }

    const form = new URLSearchParams(raw);
    const text = (form.get('text') ?? '').trim();
    const userName = form.get('user_name') ?? 'someone';
    const channelId = form.get('channel_id') ?? '';

    const { suite, workers, error } = parseCommand(text);
    if (error) {
      return ephemeral(error);
    }

    try {
      await dispatchWorkflow(env, { suite, workers, channelId, userName });
    } catch (err) {
      console.log('dispatch failed:', err.message);
      return ephemeral(
        `Could not start the run: ${err.message}\n` +
          'Check the relay logs and that the workflow file exists on the default branch.',
      );
    }

    // In-channel so the team sees who kicked it off; the workflow's own
    // message lands in the same channel when it finishes.
    return Response.json({
      response_type: 'in_channel',
      text:
        `:rocket: *${userName}* started the *${suite}* suite ` +
        `(${workers} worker${workers === '1' ? '' : 's'}). Results will post here.`,
    });
  },
};

/** `/qa`, `/qa regression`, `/qa regression 2`, `/qa help` */
function parseCommand(text) {
  if (text === 'help' || text === '?') {
    return {
      error:
        '*Usage:* `/qa [suite] [workers]`\n' +
        `*Suites:* ${SUITES.map((s) => `\`${s}\``).join(', ')} (default \`smoke\`)\n` +
        '*Workers:* 1–4, default 1. Keep it low — the storefront rate-limits ' +
        '`/cart/add.js` with HTTP 429 and hosted runners share egress IPs.',
    };
  }

  const [rawSuite = 'smoke', rawWorkers = '1'] = text.split(/\s+/).filter(Boolean);

  const suite = rawSuite.toLowerCase();
  if (!SUITES.includes(suite)) {
    return {
      error: `Unknown suite \`${rawSuite}\`. Pick one of ${SUITES.map((s) => `\`${s}\``).join(', ')}, or run \`/qa help\`.`,
    };
  }

  const workersNum = Number(rawWorkers);
  if (!Number.isInteger(workersNum) || workersNum < 1 || workersNum > 4) {
    return { error: `\`workers\` must be a whole number from 1 to 4, got \`${rawWorkers}\`.` };
  }

  return { suite, workers: String(workersNum) };
}

async function dispatchWorkflow(env, { suite, workers, channelId, userName }) {
  const url =
    `https://api.github.com/repos/${env.GITHUB_REPO}` +
    `/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'qa-agent-slack-relay',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: env.DEFAULT_REF ?? 'main',
      inputs: {
        suite,
        workers,
        slack_channel: channelId,
        triggered_by: userName,
      },
    }),
  });

  // 204 No Content is the success case for workflow_dispatch.
  if (response.status !== 204) {
    const body = await response.text();
    throw new Error(`GitHub returned ${response.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Verifies Slack's request signature.
 *
 * Without this, anyone who learns the Worker URL can trigger your CI. The
 * timestamp check is what stops a captured request being replayed later.
 */
async function verifySlack(request, rawBody, signingSecret) {
  if (!signingSecret) return { ok: false, reason: 'no signing secret configured' };

  const timestamp = request.headers.get('X-Slack-Request-Timestamp');
  const signature = request.headers.get('X-Slack-Signature');
  if (!timestamp || !signature) return { ok: false, reason: 'missing signature headers' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale timestamp' };
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`v0:${timestamp}:${rawBody}`),
  );
  const expected =
    'v0=' +
    [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(expected, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}

/** Constant-time compare, so the response time cannot be used to guess bytes. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ephemeral(text) {
  return Response.json({ response_type: 'ephemeral', text });
}
