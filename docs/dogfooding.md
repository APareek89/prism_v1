# Dogfooding: Prism measures its own development

Prism is the AI-Native Engineering Index. The most honest way to trust it is to point it
at **this repo** and watch it score how we build it.

## The workflow
Every change to Prism goes through a PR built with Codex or Claude Code:

```
git checkout -b <type>/<slug>
# real work with an opted-in agent — keep the matching co-author trailer
git commit -am "..." && git push -u origin <type>/<slug>
gh pr create --fill && gh pr merge --squash
```

## Why the trailer matters
The `Co-authored-by: Codex` or `Co-authored-by: Claude` trailer is one way Prism's GitHub connector flags a commit as
AI-assisted (`gh_commits.coauthor_trailer`), which drives:
- **Usage** — AI-assisted PR share, agentic depth
- the **AI→PR link** (`pr_ai_link`) that ties a merged PR back to the Claude session
- **Effectiveness** — merged-without-revert, retention@30d on AI-authored lines

## What lights up as PRs accumulate
| PRs merged (28d) | What you'll see |
|---|---|
| 0 | Usage only (from Claude sessions) → index *Insufficient* |
| ≥5 | Effectiveness meets min-signal → **L1 + spectrum populate** |
| ≥10 sessions | Proficiency (skill usage/authorship) contributes |

Install the Prism GitHub App on this repo (Admin → Connect GitHub), keep shipping via
PRs, and run the pipeline (or let the 06:00 Inngest cron do it) — the index grows with
the project. See [`testing.md`](testing.md) for the full path.
