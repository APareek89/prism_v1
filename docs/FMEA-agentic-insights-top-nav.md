# FMEA — agentic insights, audit flow, and top navigation

**Analyzed at:** `a05a319` plus the uncommitted `codex/agentic-insights-top-nav` change-set (findings reconciled after remediation)

**Scan scope:** 48 product/test/doc files, approximately 1,666 additions and 447 deletions

**Product context:** strengthen evidence-bound organization/personal insights and recommendations, expose their full admin trace, and move primary navigation to a professional top bar without changing deterministic index calculations. Sources: `docs/scoring-and-agentic-insights-evaluation-brief.md`, `docs/scoring-model.md`, and `docs/ARCHITECTURE_FLOW.md`.

**Failure modes found:** 12 (4 P0, 3 P1, 5 P2). All P0/P1 findings are resolved in the scanned working tree.

| # | Component | Failure mode | Effect | Root cause | S | O | D | RPN | Priority | Status |
|---|---|---|---|---|---:|---:|---:|---:|---|---|
| 1 | PR insight read model | UUID digits became PR numbers and clean explanations containing “no revert” became revert flags | Users saw wrong PR evidence and coaching labels | Presentation inferred typed metadata from arbitrary prose/reference strings | 7 | 8 | 8 | 448 | P0 | Resolved: shared typed decoder + regression tests |
| 2 | Batched insight persistence | An omitted/rejected item could shift later prose onto the wrong KPI and priority math | Admin trace could confidently explain the wrong calculation candidate | Batch ownership was positional and persistence zipped compacted output arrays | 8 | 4 | 8 | 256 | P0 | Resolved: exact candidate ids and key-based joins |
| 3 | Live pipeline | Serial per-item/per-lane LLM calls approached the 300-second request ceiling | On-demand runs could time out despite valid evidence | Narration multiplied calls by candidates, lanes, and scopes | 7 | 7 | 5 | 245 | P0 | Resolved: lane batches, three-way bounded fan-out, timeout/output caps; real run 251.1s → 131.8s |
| 4 | Agent/recommendation reads | A database error was converted to an empty array | Transient outages looked like “no signal” and could produce incomplete coaching | Loose service-role readers swallowed query errors | 8 | 4 | 7 | 224 | P0 | Resolved: errors propagate and circuit breaker prevents repeated provider/database failure |
| 5 | Same-day reruns | A shorter or partially grounded rerun left old higher-rank rows visible | Current evidence could display stale insight/PR narratives | Idempotent upsert replaced present slots but never removed obsolete slots | 7 | 4 | 7 | 196 | P1 | Resolved: successful replacement write followed by scoped stale-slot cleanup |
| 6 | Insight prioritization | Narrative ranking could use default v1 weights after an admin published another config | Recommendations and “priority gap” could disagree with the score’s model version | Agent assembler hard-coded default weights/config version | 7 | 4 | 7 | 196 | P1 | Resolved: load exact `index_daily.config_version` weights/anchors |
| 7 | Shared repair | A repair-call outage discarded first-pass items that had already grounded | One bad candidate could suppress otherwise valid insights | Batch retry was awaited as one unguarded operation | 6 | 3 | 7 | 126 | P1 | Resolved: accepted items survive; only rejected items drop |
| 8 | Provider dependency | A slow Anthropic call could consume most of the route budget and retry again inside the SDK | Admin run remained stuck with weak failure isolation | No explicit SDK timeout/output bound | 6 | 4 | 4 | 96 | P2 | Resolved: 45s request timeout, SDK retries disabled, LangChain retry limited, 4,096 output-token cap |
| 9 | Admin agentic read | A trace query error rendered as a legitimate empty-artifact state | Admin could diagnose the wrong issue | Read helper collapsed error and empty data | 4 | 3 | 7 | 84 | P2 | Resolved: query failure reaches the route error boundary |
| 10 | Grounding observability | Repeatedly rejected candidates leave no durable content-free drop counter | Operators can see what published but not aggregate drop frequency | Invalid prose is correctly not stored, but rejection telemetry is not persisted | 4 | 3 | 6 | 72 | P2 | Track: add per-run accepted/repaired/dropped counters to pipeline run telemetry |
| 11 | Pipeline concurrency | A manual admin run can overlap the daily Inngest run for the same function/date | Replacement snapshots may interleave and waste provider calls | Inngest is concurrency-one, but the synchronous route has no shared distributed lock | 5 | 2 | 6 | 60 | P2 | Track: add a database advisory/run-lock keyed by function and date |
| 12 | Recommendation capacity | Two concurrent runs can each observe spare capacity and insert different recommendations | The three-active-action coaching limit can be temporarily exceeded | Capacity check and insert are not one database transaction | 4 | 2 | 6 | 48 | P2 | Track: enforce capacity in a transactional database function |

## P0 — fixed before merge

1. Decode persisted PR `verdict`, `ref`, and `sizeBucket`; never scan UUIDs for numbers.
2. Require exact candidate ids in every structured batch and join accepted prose to deterministic candidates by id.
3. Batch each lane, run independent lanes with bounded concurrency three, and bound provider calls.
4. Propagate database failures so an outage cannot become an honest-looking empty state.

## P1 — fixed before merge

1. Replace same-day insight snapshots coherently and remove stale ranks only after successful writes.
2. Rank against the exact config version stamped on the score row.
3. Isolate the shared repair path so accepted first-pass items survive a retry outage.

## P2 — tracked

1. Add content-free accepted/repaired/dropped counters to durable pipeline telemetry.
2. Serialize manual and scheduled runs with a cross-process function/date lock.
3. Move the active-recommendation capacity check into an atomic database operation.

**Coverage:** 12/12 categories checked. No applicable failure mode found in `billing_credit_mismatches` (Prism does not charge or credit users in this flow). Categories covered: unhandled errors, external dependencies, races/state, resource exhaustion, security/access control, partial writes/data integrity, observability, scale/load, retry/idempotency, config drift, and brief/PRD edge cases.
