#!/usr/bin/env node
/**
 * Minimal CircleCI API v2 client for this project, reused by qa-runner and
 * qa-reporter (and anything else that needs to trigger or poll a pipeline).
 *
 * This logic was proven out by hand with curl against gh/Kranti92/QA-Agent
 * before being written down here — see knowledge/worklog.md, 2026-10-06.
 *
 * Reads CIRCLE_TOKEN from ../.env (same file the test suite's BASE_URL etc.
 * live in). CIRCLE_PROJECT_SLUG defaults to gh/Kranti92/QA-Agent.
 *
 *   node scripts/circleci.mjs trigger <branch> <suite> [workers] [channel] [triggeredBy]
 *   node scripts/circleci.mjs poll <pipelineId> [timeoutSeconds]
 *   node scripts/circleci.mjs artifacts <jobNumber>
 *   node scripts/circleci.mjs download <jobNumber> <artifactPath> <outFile>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const path = resolve(here, '..', '.env');
  const env = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      env[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const TOKEN = process.env.CIRCLE_TOKEN ?? env.CIRCLE_TOKEN;
const SLUG = process.env.CIRCLE_PROJECT_SLUG ?? env.CIRCLE_PROJECT_SLUG ?? 'gh/Kranti92/QA-Agent';

if (!TOKEN) {
  console.error('CIRCLE_TOKEN not found in automation/.env or the environment');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`https://circleci.com/api/v2${path}`, {
    method,
    headers: {
      'Circle-Token': TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CircleCI ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function apiV1(path) {
  const res = await fetch(`https://circleci.com/api/v1.1${path}`, {
    headers: { 'Circle-Token': TOKEN, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CircleCI v1.1 ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Triggers a pipeline and returns { number, id }. */
export async function trigger(branch, suite, workers = '1', slackChannel = '', triggeredBy = '') {
  const pipeline = await api('POST', `/project/${SLUG}/pipeline`, {
    branch,
    parameters: { suite, workers, slack_channel: slackChannel, triggered_by: triggeredBy },
  });
  return { number: pipeline.number, id: pipeline.id };
}

/**
 * Polls a pipeline's workflow until it leaves running/on_hold, or the
 * timeout elapses. Returns { status, jobNumber, workflowId } — status is
 * one of CircleCI's terminal states, or 'timeout' if the budget ran out
 * (not an error: the caller should report "still running, check back").
 */
export async function poll(pipelineId, timeoutSeconds = 100) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let workflowId = null;

  while (Date.now() < deadline) {
    const wf = await api('GET', `/pipeline/${pipelineId}/workflow`);
    const item = wf.items?.[0];
    if (!item) {
      await sleep(3000);
      continue;
    }
    workflowId = item.id;
    if (item.status !== 'running' && item.status !== 'on_hold') {
      const jobs = await api('GET', `/workflow/${workflowId}/job`);
      const jobNumber = jobs.items?.[0]?.job_number ?? null;
      return { status: item.status, jobNumber, workflowId };
    }
    await sleep(5000);
  }
  return { status: 'timeout', jobNumber: null, workflowId };
}

/** Artifact listing for a job, as [{path, url}]. */
export async function artifacts(jobNumber) {
  const data = await api('GET', `/project/${SLUG}/${jobNumber}/artifacts`);
  return data.items.map((i) => ({ path: i.path, url: i.url }));
}

/** Downloads one artifact by its published path to a local file. */
export async function download(jobNumber, artifactPath, outFile) {
  const items = await artifacts(jobNumber);
  const match = items.find((i) => i.path === artifactPath);
  if (!match) throw new Error(`no artifact at path "${artifactPath}" on job ${jobNumber}`);
  const res = await fetch(match.url);
  if (!res.ok) throw new Error(`downloading ${match.url} -> ${res.status}`);
  writeFileSync(outFile, await res.text(), 'utf8');
  return outFile;
}

/** The v1.1 job detail CircleCI's dashboard shows: steps, outcome, timings. */
export async function jobDetail(jobNumber) {
  const [, org, repo] = SLUG.split('/'); // "gh/Kranti92/QA-Agent" -> github/Kranti92/QA-Agent
  return apiV1(`/project/github/${org}/${repo}/${jobNumber}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- CLI ---
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'trigger') {
      const [branch, suite, workers, channel, by] = args;
      console.log(JSON.stringify(await trigger(branch, suite, workers, channel, by), null, 2));
    } else if (cmd === 'poll') {
      const [pipelineId, timeout] = args;
      console.log(JSON.stringify(await poll(pipelineId, timeout ? Number(timeout) : undefined), null, 2));
    } else if (cmd === 'artifacts') {
      console.log(JSON.stringify(await artifacts(args[0]), null, 2));
    } else if (cmd === 'download') {
      const [jobNumber, artifactPath, outFile] = args;
      console.log(await download(jobNumber, artifactPath, outFile));
    } else if (cmd === 'job-detail') {
      console.log(JSON.stringify(await jobDetail(args[0]), null, 2));
    } else {
      console.error('usage: circleci.mjs <trigger|poll|artifacts|download|job-detail> ...');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
