/**
 * OPTIONAL hosted alternative to local-bot.mjs.
 *
 * `local-bot.mjs` (Socket Mode, runs on your machine) is the active path and
 * needs no hosting. This file exists for the case where `/qa` must work while
 * your machine is off — a Cloudflare Worker is always on.
 *
 * Unlike Socket Mode, an HTTP slash command is an unauthenticated public
 * endpoint, so verifying Slack's request signature is mandatory here.
 *
 * Secrets (wrangler secret put <NAME>):
 *   SLACK_SIGNING_SECRET  Slack app -> Basic Information
 *   CIRCLE_TOKEN          CircleCI personal API token   (PROVIDER=circleci)
 *   GITHUB_TOKEN          fine-grained PAT, Actions: write (PROVIDER=github)
 *
 * Vars live in wrangler.toml. Deploy with `npm run deploy`.
 *
 * Note: the app manifest sets socket_mode_enabled: true and gives the slash
 * command no URL. To use this Worker instead, turn Socket Mode off and set
 * the command's Request URL to the deployed Worker URL.
 */
import {
  parseCommand,
  dispatchCircleCI,
  dispatchGitHub,
  ackText,
} from './lib.mjs';

const MAX_SKEW_SECONDS = 60 * 5;

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('POST only', { status: 405 });

    const raw = await request.text();

    const check = await verifySlack(request, raw, env.SLACK_SIGNING_SECRET);
    if (!check.ok) {
      // Log the reason, but do not tell the caller which check failed.
      console.log('rejected slack request:', check.reason);
      return new Response('unauthorized', { status: 401 });
    }

    const form = new URLSearchParams(raw);
    const userName = form.get('user_name') ?? 'someone';
    const channelId = form.get('channel_id') ?? '';

    const { suite, workers, error } = parseCommand(form.get('text') ?? '');
    if (error) return ephemeral(error);

    const useGitHub = env.PROVIDER === 'github';
    const cfg = useGitHub
      ? {
          token: env.GITHUB_TOKEN,
          repo: env.GITHUB_REPO,
          workflowFile: env.WORKFLOW_FILE,
          ref: env.DEFAULT_REF,
        }
      : {
          token: env.CIRCLE_TOKEN,
          projectSlug: env.CIRCLE_PROJECT_SLUG,
          ref: env.DEFAULT_REF,
        };

    try {
      const pipeline = await (useGitHub ? dispatchGitHub : dispatchCircleCI)(cfg, {
        suite,
        workers,
        channelId,
        userName,
      });

      return Response.json({
        response_type: 'in_channel',
        text: ackText({ userName, suite, workers, pipelineNumber: pipeline.number }),
      });
    } catch (err) {
      console.log('dispatch failed:', err.message);
      return ephemeral(
        `Could not start the run: ${err.message}\n` +
          'Check the relay logs, and that the CI config is on the default branch.',
      );
    }
  },
};

/**
 * Verifies Slack's request signature. Without it, anyone who learns the
 * Worker URL can trigger CI. The timestamp check is what stops a captured
 * request being replayed later.
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
    'v0=' + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqual(expected, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' };
}

/** Constant-time compare, so response timing cannot be used to guess bytes. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ephemeral(text) {
  return Response.json({ response_type: 'ephemeral', text });
}
