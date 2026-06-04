# Replace hardcoded DeltaScheduler increment with a learned policy

## Summary

- Replaces the hardcoded `processingTimeIncrement = 10` in `DeltaScheduler`
  with a learned policy that picks from `[0, 5, 10, 20, 40, 80]` ms per turn
  based on the current scheduling state
- On held-out simulator evaluation: **42% fewer turns on heavy sessions
  (≥1k ops)** with avg max turn duration of 378ms (1.83× baseline), well under
  user-perceptible jank
- Behind `USE_LEARNED_INCREMENT_POLICY` flag, default off — production behavior
  unchanged until flighting begins

## Why

`DeltaScheduler` processes inbound ops in fixed-budget turns and grows the
budget by a hardcoded +10ms each turn. For light sessions this is fine; for
heavy catch-up (thousands of ops, e.g. clients coming back online after being
offline, summarizer replay) it produces far more turns than necessary,
extending recovery time noticeably without UX benefit.

## What changed

1. New file `incrementPolicy.ts` — pure function `getIncrementMs(state)`
   that returns the chosen increment via a discrete lookup table
2. New file `lookup_table.json` — the trained policy as a discretized
   lookup table (~12 KB gzipped over the wire, 426 KB raw)
3. `deltaScheduler.ts` — three small changes:
   - Track 3 new per-session fields needed by the policy
     (`initialTotalOps`, `impliedTurnsNaive`, `t1Throughput`,
     `t1TimeToResumeMs`)
   - Call `getIncrementMs` at the increment site, behind the feature flag
   - Emit `InboundOpsIncrementChosen` telemetry so flighting can join
     decisions to outcomes

For full implementation context and how this evolved across multiple data
collections, simulator iterations, and reward designs, see
[`scheduler_integration.md`](./scheduler_integration.md).

## Test plan

- [ ] Unit tests: `incrementPolicy.ts` returns one of the 6 valid actions for
  representative state inputs and falls back to +10ms for invalid inputs
- [ ] Unit tests: `DeltaScheduler` correctly captures the 4 new per-session
  fields and resets them on idle
- [ ] Unit tests: feature flag off → behavior is bit-identical to current
  production
- [ ] Existing `DeltaScheduler` tests pass with policy enabled and disabled
- [ ] Bundle size: confirm `lookup_table.json` bundles cleanly and gzipped
  delivery size is ~12 KB (validated locally; verify in CI artifact)
- [ ] Manual: catch-up scenario with `USE_LEARNED_INCREMENT_POLICY = true`
  finishes in noticeably fewer turns with no visible UI jank

## Rollout

1. Land with `USE_LEARNED_INCREMENT_POLICY = false`. Production unchanged;
   new telemetry starts flowing on the +10 baseline
2. Flight to 1% via experimentation config. Watch
   `InboundOpsProcessingTime.numberOfTurns` and per-turn durations vs control.
   Expected: **~30–45% fewer turns on heavy sessions**, avg max turn ≤ 1.5–2×
   baseline. Kill if individual turns frequently exceed ~1000ms
3. Ramp 1% → 10% → 50% → 100% if metrics hold

## Risk

- **Low risk by design** — feature flag defaults off, all changes guarded
- The policy was trained on a simulator; transfer to production is the
  open question that flighting will answer
- Fall back behavior on invalid policy state defaults to +10ms (baseline)
- See "Risks" section of [`scheduler_integration.md`](./scheduler_integration.md)
  for the full set of validation steps applied before this PR
