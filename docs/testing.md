# Testing Prism end-to-end

A short, repeatable path to exercise the whole loop on real data. The app runs on
`http://localhost:3000` (`npm run dev`); you're auto-signed-in as the demo user.

## 0. Clean slate (optional)
```bash
npm run demo:reset      # clears connectors + ingested/derived data; keeps seed + self employee
```

## 1. Connect Claude Code (no signup)
Admin → **Claude Code → Scan local sessions**. Reads `~/.claude/**/*.jsonl` live and
ingests your sessions → the card flips to **Connected**.

## 2. Connect GitHub
One-time on the GitHub App (Settings → Developer settings → GitHub Apps → your app):
- **Callback URL** = `http://localhost:3000/api/connectors/github/install`
- **Setup URL** = same; enable *Request user authorization (OAuth) during installation*
- Repository permissions (Read): Contents, Metadata, Pull requests, Commit statuses
- Subscribe to events: Pull request, Push

Then Admin → **Connect GitHub** → approve in the browser → pick a repo you own.

## 3. Produce merged PRs (with Claude Code)
The index needs *delivery* data. Effectiveness meets its min-signal at **≥5 merged PRs**
in the trailing 28 days. Dogfood on this repo, or any repo you own:
```bash
git checkout -b feature-x
# ...real changes with Claude Code (keep the Co-authored-by: Claude trailer)...
git commit -am "feat: ..." && git push -u origin feature-x
gh pr create --fill && gh pr merge --squash
```

## 4. Score it
Admin → **Run pipeline now** (or `POST /api/pipeline/run`). It ingests → links AI↔PR →
scores → generates insights/recommendations/courses → queues the digest. Watch:
- **Function / My view** — L1 + the four spectrum bars populate once confidence ≥ 0.40
- **My view** — PR-level insights, "Recommended for you", assigned course
- **Function** — "What moved the index", tokens/PR cost lens

## Notes
- With only Claude sessions and no PRs, the index is honestly **Insufficient** (Usage is
  only 10% of the weight) — connect GitHub to cross the threshold.
- Email: blank `RESEND_API_KEY` ⇒ the digest renders + queues but does not send. Set it via
  `supabase secrets set` on the `send-digest` Edge Function to actually deliver.
- Webhooks (live PR updates) need a `smee.io` tunnel; "Run pipeline now" backfills without them.
