# Adaptive op scheduling — DeltaScheduler increment policy

Replaces the hardcoded `processingTimeIncrement = 10` in `DeltaScheduler` with
a learned policy that picks the per-turn budget increment from
`[0, 5, 10, 20, 40, 80]` ms based on the current scheduling state.

## Files in this folder

| File | Destination in fluid-framework repo |
|---|---|
| `lookup_table.json` | `packages/runtime/container-runtime/src/` |
| `incrementPolicy.ts` | `packages/runtime/container-runtime/src/` |
| `scheduler_integration.md` | this doc (project context, not shipped) |

## Why

`DeltaScheduler` processes inbound ops in turns. Each turn runs for at most
`processingTime` ms, then yields via `setTimeout` and resumes with the budget
grown by `processingTimeIncrement` (currently +10ms each turn). The constants
are hardcoded and don't adapt to backlog size, device speed, or contention.

For light sessions the constant is fine; for heavy catch-up (thousands of ops)
it produces far more turns than necessary, slowing recovery noticeably on
clients coming back online or in summarizer replay.

## What the trained policy does

The policy takes 8 input features and returns one of six increment values.
Across the discretized state grid (145,152 cells):

| Action | % of cells | When the policy picks it |
|---|---|---|
| +80ms | 52.8% | Heavy/active state — needs big budget growth to catch up fast |
| +5ms | 23.7% | Light/cautious state — keep individual turns short |
| +0ms | 14.6% | Near-completion or very low throughput |
| +20ms | 5.5% | Moderate state |
| +40ms | 1.8% | Edge cases |
| +10ms | 1.6% | Edge cases |

The result: same baseline behavior for light sessions, dramatically faster
catch-up for heavy ones, individual turn duration capped well under user-
perceptible jank.

### Held-out simulator evaluation (500 episodes vs +10ms baseline)

| Metric | Baseline (+10) | Shipped policy | Delta |
|---|---|---|---|
| Avg turns per session | 16.7 | 8.9 | **47% fewer** |
| Heavy sessions (≥1k ops) | 26.9 turns | 15.5 turns | **42% fewer** |
| Light sessions (<500 ops) | 5.7 turns | 3.5 turns | **38% fewer** |
| Avg max turn duration | 207ms | 378ms | 1.83× |

Max turn 378ms is well under typical UI jank thresholds (~500–1000ms).

## How this evolved

The project went through several iterations across two phases:

### Phase 1 — supervised regression

XGBoost predicting `total_turns` from turn-1 telemetry. Used to (a) validate
that turn-1 signals carry meaningful predictive signal and (b) identify which
features matter most. On v6 data, MAE was 3.67 turns vs a mean-prediction
baseline of 7.19 (49% better).

Top features by SHAP (v6):
1. `implied_turns_naive` — `ceil(t1_ops_remaining / t1_ops_processed)`
2. `t1_ops_remaining`
3. `t1_time_to_resume`
4. `remaining_fraction`
5. `t1_ops_processed`

The decay curve was also re-fit on v6 data. The v4-era assumption of
`(t+1)^(-0.5417)` doesn't hold on v6 — throughput is roughly **constant**
across turns. The simulator was updated accordingly.

### Phase 2 — reinforcement learning

PPO trains on a simulator that replays real sessions (using turn-1 signals as
seed conditions and the fitted throughput curve to advance turns). The agent
chooses an increment each turn; reward = `-1 per turn + 100 completion bonus +
hard penalty for turns over 1000ms`.

Key iterations that mattered:

| Change | Why it mattered |
|---|---|
| **Data v6 with explicit variance** | Five prior data collections were either too small or skewed toward a narrow session-size range. v6 covers light/medium/heavy buckets evenly across throughput and contention axes |
| **Balanced sampling by turn count** | v6 still has many short sessions; training on the natural distribution made PPO ignore the heavy tail. Forced equal exposure per turn-count bucket |
| **Refit decay curve on v6** | v4 assumed throughput drops sharply between turn 1 and 2; v6 shows constant throughput. Old simulator misled the agent |
| **Fixed observation normalization** | Features span 6 orders of magnitude (`t1_time_to_resume` reaches 2.6M ms). PPO can't learn from un-normalized features at this scale |
| **Fixed turn-duration boundary bug** | Turns that consumed the full budget but processed 0 ops were being reported as 0ms duration, hiding the cost of low-throughput attempts |
| **Added 3 features from Phase 1** | `initial_total_ops`, `implied_turns_naive`, and `remaining_fraction` were Phase 1's top signals but missing from Phase 2's state. Adding them unlocked genuine state-aware tapering |
| **Tuned `ent_coef` to 0.10** | Entropy regularization keeps PPO exploring long enough to find the state-aware basin. Too low (0.0) → +80-only policies; too high → no convergence |
| **Used v4-style threshold reward** | Quadratic and soft-ramp rewards over-engineered the responsiveness penalty. The simple hard cliff at 1000ms gave PPO the clearest optimization signal |

The simulator and reward function went through ~6 iterations each before
converging on the final configuration.

## Integration

See `incrementPolicy.ts` for the runtime contract. The DeltaScheduler change
is small:

1. **Track 3 new per-session fields** alongside existing scheduling state:
   - `t1Throughput` — captured at end of turn 1 (`opsProcessed / 50`)
   - `t1TimeToResumeMs` — captured at end of turn 1
   - `initialTotalOps` — captured at start of session
   - `impliedTurnsNaive` — captured at end of turn 1
2. **Replace the `+10` constant** with a call to `getIncrementMs(state)`. On
   turn 1 (before t1 signals exist) fall back to baseline.
3. **Add `InboundOpsIncrementChosen` telemetry** so flighting can correlate
   policy decisions with outcomes.
4. **Add a `USE_LEARNED_INCREMENT_POLICY` flag** so the policy can be disabled
   in one line if a regression appears.

```typescript
import { getIncrementMs } from "./incrementPolicy.js";

const USE_LEARNED_INCREMENT_POLICY = false;

// In the increment site:
const policyReady =
    USE_LEARNED_INCREMENT_POLICY &&
    this.t1Throughput !== undefined &&
    this.initialTotalOps !== undefined;

const incrementMs = policyReady
    ? getIncrementMs({
          opsRemaining: this.inbound.length,
          turnNumber: this.numberOfTurns,
          allowedTimeMs: this.processingTime,
          t1Throughput: this.t1Throughput!,
          t1TimeToResumeMs: this.t1TimeToResumeMs!,
          initialTotalOps: this.initialTotalOps!,
          impliedTurnsNaive: this.impliedTurnsNaive!,
          remainingFraction: this.inbound.length / this.initialTotalOps!,
      })
    : this.processingTimeIncrement;

this.processingTime += incrementMs;
```

## Rollout plan

1. Land with `USE_LEARNED_INCREMENT_POLICY = false`. Behavior unchanged;
   `InboundOpsIncrementChosen` telemetry starts flowing (always +10).
2. Flip to `true` for 1% of clients via experimentation config.
3. Watch `InboundOpsProcessingTime.numberOfTurns` and per-turn duration. The
   1% flight should show **~30–45% fewer turns on heavy sessions** with
   **avg max turn ≤ 1.5–2× baseline**. If individual turns frequently exceed
   ~1000ms, the policy is misbehaving — kill the flight.
4. Ramp 1% → 10% → 50% → 100% if metrics hold.

## Costs

| Resource | Cost |
|---|---|
| Bundle size (over the wire, gzipped) | **~12 KB** for `lookup_table.json` |
| Bundle size (raw / in memory) | 426 KB |
| Per-turn CPU | ~8 bin lookups + array index — microseconds |
| Server / training | Zero recurring. Re-training is offline |

If in-memory size becomes a concern, the table can be re-encoded as a base64
Uint8Array (~195 KB in memory) at the cost of unreadable diffs and grep-ability.
Not worth it unless measured otherwise.

## Re-training

If you collect more telemetry and want to refresh the policy:

```bash
# 1. Build splits, balancing heavy/light buckets
python3 build_splits.py --raw all_turns_raw_vN.csv \
    --out-dir data/run-NN-vN --balance-by-turns

# 2. Train 5 seeds (basin-find rate is ~78% per seed)
python3 sweep_threshold.py --thresholds 1000 --reward-shape threshold \
    --seeds 0 1 2 3 4 --timesteps 500000 --save-best --ent-coef 0.1 \
    --data-dir data/run-NN-vN

# 3. Pick the seed with the best held-out heavy improvement
# 4. Regenerate the lookup table
python3 build_lookup_table.py \
    --model experiments/phase2_policy_<reward_shape>_thr<thr>_seed<best> \
    --out lookup_table.json
```

**Important**: train at least 5 seeds and pick the best by held-out metrics.
Single-seed training has a ~22% chance of landing on a regression policy.
