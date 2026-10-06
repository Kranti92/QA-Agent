#!/usr/bin/env node
/**
 * /qa Slack bot — runs on your own machine, no hosting required.
 *
 * Uses Slack **Socket Mode**: the process opens an outbound WebSocket to
 * Slack, so there is no public URL, no tunnel (ngrok et al), no inbound
 * firewall rule, and no request-signature verification to get wrong — the
 * app-level token authenticates the connection itself.
 *
 * The trade-off is uptime: `/qa` only works while this process is running.
 * If the machine is asleep Slack reports the command as failed.
 *
 * Note this is only the *trigger* direction. CircleCI posts run results
 * straight to Slack's API, so notifications keep working whether or not this
 * process is up.
 *
 *   cd slack-bot && npm start
 *
 * Config, read from ../.env (shared with the test suite) or ./.env:
 *   SLACK_BOT_TOKEN        xoxb-…   OAuth & Permissions
 *   SLACK_APP_TOKEN        xapp-…   Basic Information -> App-Level Tokens
 *                                   (needs the connections:write scope)
 *   CIRCLE_TOKEN           CircleCI personal API token
 *   CIRCLE_PROJECT_SLUG    default gh/Kranti92/QA-Agent
 *   DEFAULT_REF            default main
 */
import { App, LogLevel } from '@slack/bolt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseCommand, dispatchCircleCI, ackText } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The suite's .env already holds CIRCLE_TOKEN, so read that first and let a
// local .env override it.
dotenv.config({ path: resolve(here, '..', '.env') });
dotenv.config({ path: resolve(here, '.env'), override: true });

const required = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'CIRCLE_TOKEN'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required config: ${missing.join(', ')}`);
  console.error('Add them to automation/.env (gitignored) and retry.');
  process.exit(1);
}

const circle = {
  token: process.env.CIRCLE_TOKEN,
  projectSlug: process.env.CIRCLE_PROJECT_SLUG ?? 'gh/Kranti92/QA-Agent',
  ref: process.env.DEFAULT_REF ?? 'main',
};

/**
 * Optional allowlist of Slack user ids permitted to start runs, comma
 * separated. Left empty, anyone who can see /qa can trigger CI — fine for a
 * private channel, worth setting for a shared workspace.
 */
const allowlist = (process.env.QA_ALLOWED_USERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: process.env.DEBUG ? LogLevel.DEBUG : LogLevel.INFO,
});

app.command('/qa', async ({ command, ack, respond, say }) => {
  // Slack expects an ack within 3 seconds. Do it before any network call,
  // otherwise a slow CircleCI response shows the user a timeout error.
  await ack();

  if (allowlist.length && !allowlist.includes(command.user_id)) {
    await respond({
      response_type: 'ephemeral',
      text: `:no_entry: \`${command.user_name}\` is not allowed to start QA runs.`,
    });
    return;
  }

  const { suite, workers, error } = parseCommand(command.text);
  if (error) {
    await respond({ response_type: 'ephemeral', text: error });
    return;
  }

  try {
    const pipeline = await dispatchCircleCI(circle, {
      suite,
      workers,
      channelId: command.channel_id,
      userName: command.user_name,
    });

    console.log(
      `[${new Date().toISOString()}] ${command.user_name} -> ${suite} ` +
        `(${workers}w), pipeline #${pipeline.number}`,
    );

    // In-channel so the team can see a run is underway; CircleCI posts the
    // result into the same channel later.
    await say({ text: ackText({ userName: command.user_name, suite, workers, pipelineNumber: pipeline.number }) });
  } catch (err) {
    console.error('dispatch failed:', err.message);
    await respond({
      response_type: 'ephemeral',
      text:
        `:warning: Could not start the run: ${err.message}\n` +
        'Check that `.circleci/config.yml` is on the default branch and that ' +
        '`CIRCLE_TOKEN` is still valid.',
    });
  }
});

// Bolt swallows nothing by default, but an unhandled rejection here would
// kill a long-running local process. Keep it alive and visible.
process.on('unhandledRejection', (err) => {
  console.error('unhandled rejection:', err);
});

await app.start();
console.log('/qa bot connected to Slack via Socket Mode.');
console.log(`   project : ${circle.projectSlug}`);
console.log(`   branch  : ${circle.ref}`);
console.log(
  `   access  : ${allowlist.length ? `${allowlist.length} allowlisted user(s)` : 'anyone in the workspace'}`,
);
console.log('Leave this running. Ctrl+C to stop — /qa stops working when it does.');
