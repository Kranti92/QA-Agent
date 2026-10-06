# Slack bot — run the QA suite from Slack

```
/qa                     smoke suite, 1 worker
/qa regression          full functional suite
/qa anomaly 2           known-defect specs, 2 workers
/qa help                usage
```

The pipeline posts the result back into the same channel when it finishes,
with pass/fail counts, any failed spec names, and buttons for the HTML report
and the build log.

## How the pieces fit

```
Slack  ──/qa──▶  Cloudflare Worker  ──API v2 pipeline──▶  CircleCI
  ▲                 (verifies signature,                      │
  │                  acks within 3s)                          │
  └──────────── chat.postMessage ◀── curl in config.yml ───────┘
```

**CircleCI is the primary runner.** `.github/workflows/qa.yml` is kept as a
manually dispatchable fallback with its automatic triggers commented out —
two CI systems running the same add-to-cart suite on one push share nothing
except the storefront's 429 rate limit, and would trip it twice as fast.

Three things that are easy to get wrong before you start:

- **Slack cannot call CI directly.** A slash command sends a form-encoded
  body with Slack's own signature headers; neither CircleCI's nor GitHub's
  API accepts that. The official GitHub Slack app only *subscribes* to
  workflow events — it cannot dispatch them. Hence the Worker.
- **Slack enforces a 3-second response.** The Worker acknowledges
  immediately and the pipeline reports separately. A relay that waited for
  the tests would time out every time.
- **CircleCI pipeline parameters only arrive via an API trigger**, and they
  must already be declared in `.circleci/config.yml` or the API returns 400.
  Pushes and scheduled pipelines use the declared defaults.

## Why CircleCI here

Its artifacts are served as individual browsable files, so
`reports/html/index.html` opens straight in the browser. GitHub Actions only
offers a zip behind a login, which is painful on a phone — and since this
repo is private, GitHub Pages is not an option either (that needs
Enterprise). This sidesteps the problem rather than adding another host.

## Setup

Nothing below should be pasted into a chat window, a commit, or an issue.

### 1. Connect the project

<https://app.circleci.com> → **Projects** → *Create Project* / *Set Up* for
`Kranti92/QA-Agent` → pick the existing `.circleci/config.yml` on `main`.

### 2. CircleCI environment variables

*Project Settings → Environment Variables*:

| Name | Value |
|---|---|
| `SLACK_ACCESS_TOKEN` | Slack bot token, `xoxb-…` |
| `SLACK_DEFAULT_CHANNEL` | channel id for pushes and scheduled runs, e.g. `C0123456789` |

The channel **id** is under *channel name → About → scroll to the bottom* —
not the `#name`. Invite the bot to that channel, or rely on
`chat:write.public`.

If `SLACK_ACCESS_TOKEN` is absent the notify step skips rather than failing,
so you can set the pipeline up first and add Slack afterwards.

### 3. Slack app

1. <https://api.slack.com/apps> → **Create New App** → **From a manifest**
2. Paste [`manifest.yaml`](manifest.yaml) — the slash-command URL is a
   placeholder for now
3. **Install to Workspace**
4. Copy the **Bot User OAuth Token** (`xoxb-…`) → that is
   `SLACK_ACCESS_TOKEN` above
5. Copy the **Signing Secret** from *Basic Information* → used next

### 4. CircleCI API token

*User Settings → Personal API Tokens* → create one. Scoped to your user, so
treat it as a credential: it can trigger pipelines on every project you can
see.

### 5. Deploy the relay

```bash
cd slack-bot
npm install -g wrangler
wrangler login

wrangler secret put SLACK_SIGNING_SECRET
wrangler secret put CIRCLE_TOKEN

wrangler deploy
```

`wrangler deploy` prints the Worker URL. Put it in the Slack app's
*Slash Commands → /qa → Request URL*, save, and reinstall the app.

`wrangler.toml` already sets `PROVIDER = "circleci"` and
`CIRCLE_PROJECT_SLUG = "gh/Kranti92/QA-Agent"`. Switching
`PROVIDER` to `github` makes the same Worker drive GitHub Actions instead —
it then reads `GITHUB_TOKEN`, `GITHUB_REPO` and `WORKFLOW_FILE`.

### 6. Nightly run

*Project Settings → Triggers → Scheduled Pipeline*. Use a scheduled pipeline
rather than the old in-config `triggers: schedule`, which is deprecated and
cannot pass parameters. A scheduled pipeline can, so the nightly run can set
`suite=all` while pushes stay on `smoke`.

Keep it daily. See below.

### 7. First run

Trigger once from the CircleCI UI before trying `/qa` — that separates
pipeline problems from relay problems.

## The constraint that shapes all of this

The storefront rate-limits `POST /cart/add.js` with HTTP 429
(`too_many_requests`), and once tripped it stays tripped for several minutes.
CI runners share outbound IPs, so this bites sooner there than on a laptop.

Accordingly:

- `workers` defaults to **1** in CI, and the Worker caps it at 4
- the schedule is daily, not hourly
- only one CI system runs the suite automatically
- `scripts/slack-summary.mjs` recognises the 429 signature and reports the
  run as *throttled* with an hourglass, keeping it distinct from a product
  regression

If every add-to-cart test fails at once, check this before reading the diff:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://sauce-demo.myshopify.com/cart/add.js" -d "id=611951029&quantity=1"
```

## Hardening worth doing before this reaches a shared channel

- **Restrict who can trigger runs.** Check `user_id` against an allowlist, or
  at least `team_id`. As written, anyone in the workspace who can see `/qa`
  can start a pipeline.
- **Rate-limit the Worker**, so nobody can queue fifty runs.
- **Rotate the CircleCI and Slack tokens** on a schedule, and keep them out
  of `wrangler.toml` — `wrangler secret put` stores them encrypted, the TOML
  file is committed.

## Local checks

The notification path is testable without CI:

```bash
npx playwright test tests/dataIntegrity.spec.ts   # writes reports/results.json
node scripts/slack-summary.mjs --stdout           # human-readable
CIRCLE_BUILD_URL=https://circleci.com/x/1 CIRCLE_BRANCH=main \
  SUITE=smoke SLACK_CHANNEL=C123 \
  node scripts/slack-summary.mjs --payload        # exact Slack body
```

Do not pass `--reporter` to `playwright test`: it **replaces** the reporters
configured in `playwright.config.ts`, so `reports/results.json` never gets
written and the summary has nothing to read.
