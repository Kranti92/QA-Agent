# Slack bot — run the QA suite from Slack

```
/qa                     smoke suite, 1 worker
/qa regression          full functional suite
/qa anomaly 2           known-defect specs, 2 workers
/qa help                usage
```

Slack posts the result back into the same channel when the run finishes,
with the pass/fail counts and buttons for the HTML report and the run log.

## How the pieces fit

```
Slack  ──/qa──▶  Cloudflare Worker  ──workflow_dispatch──▶  GitHub Actions
  ▲                  (verifies signature,                        │
  │                   acks within 3s)                            │
  └────────── chat.postMessage ◀── slack-github-action ───────────┘
```

Two things that are easy to get wrong before you start:

- **The official GitHub Slack app cannot do this.** `/github subscribe`
  gives you workflow *notifications* only; it has no way to dispatch a
  workflow. That is the whole reason the Worker exists.
- **Slack enforces a 3-second response.** The Worker acknowledges
  immediately and the workflow reports separately — a relay that waited for
  the test run would always time out.

## Setup

### 1. GitHub token

Create a **fine-grained** PAT at
<https://github.com/settings/personal-access-tokens/new>:

- Repository access: **only** `Kranti92/QA-Agent`
- Permissions: `Actions: Read and write`, `Contents: Read-only`
- Short expiry, and rotate it

Do not use a classic PAT. A classic token with `repo` scope can administer
and delete every repository on the account; this one only needs to press a
button on one repo.

### 2. Slack app

1. <https://api.slack.com/apps> → **Create New App** → **From a manifest**
2. Paste [`manifest.yaml`](manifest.yaml) (the slash-command URL is a
   placeholder for now)
3. **Install to Workspace**
4. Copy the **Bot User OAuth Token** (`xoxb-…`) and the **Signing Secret**
   from *Basic Information*

### 3. Deploy the relay

```bash
cd slack-bot
npm install -g wrangler
wrangler login

wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put GITHUB_TOKEN

wrangler deploy
```

`wrangler deploy` prints the Worker URL. Put it in the Slack app's
*Slash Commands → /qa → Request URL*, save, and reinstall the app.

### 4. Repository secrets

In the repo → *Settings → Secrets and variables → Actions*:

| Kind | Name | Value |
|---|---|---|
| Secret | `SLACK_BOT_TOKEN` | the `xoxb-…` bot token |
| Variable | `SLACK_DEFAULT_CHANNEL` | channel id for scheduled runs, e.g. `C0123456789` |

The channel id is in Slack under *channel name → About → scroll down*, not
the `#name`. Invite the bot to that channel (`/invite @QA Agent`) unless you
rely on `chat:write.public`.

### 5. First run

`workflow_dispatch` only works once the workflow exists **on the default
branch**, so push `.github/workflows/qa.yml` before trying `/qa`. Confirm it
end to end from the Actions tab first — that isolates workflow problems from
relay problems.

## The constraint that shapes all of this

The storefront rate-limits `POST /cart/add.js` with HTTP 429
(`too_many_requests`), and once tripped it stays tripped for several
minutes. Hosted runners share outbound IPs, so CI hits this sooner than a
laptop does.

Accordingly:

- `workers` defaults to **1** in CI and the Worker caps it at 4
- the workflow uses a `concurrency` group so two runs cannot overlap
- the schedule is daily, not hourly
- `scripts/slack-summary.mjs` detects the 429 signature and labels the run
  *throttled* with an hourglass instead of reporting a product regression

If every add-to-cart test fails at once, check this before reading the diff:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://sauce-demo.myshopify.com/cart/add.js" -d "id=611951029&quantity=1"
```

## Reports

The HTML report is uploaded as a build artifact and the Slack message links
straight to it. Artifact links need a GitHub login and arrive as a zip, which
is poor on a phone.

For a one-click report, host it instead:

- **Public repo** → GitHub Pages via `actions/deploy-pages`
- **Private repo** → GitHub Pages needs Enterprise, so use Cloudflare Pages
  (`wrangler pages deploy reports/html`) and link that URL. You already have
  a Cloudflare account for the Worker.

## Hardening worth doing before this goes near a shared channel

- Restrict who can trigger runs: check `form.get('user_id')` against an
  allowlist, or Slack's `team_id`, and return an ephemeral refusal otherwise.
  Right now anyone in the workspace who can see `/qa` can start a run.
- Add a Worker rate limit, so a bored colleague cannot queue fifty runs.
- Log dispatches somewhere durable if you need an audit trail — Worker
  `console.log` output is not retained long.
