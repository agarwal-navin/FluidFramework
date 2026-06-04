/**
 * Adaptive op-scheduling increment policy.
 *
 * Replaces the hardcoded `processingTimeIncrement = 10` in DeltaScheduler with
 * a learned policy compiled to a discrete lookup table. See build_lookup_table.py
 * for how lookup_table.json is generated from the trained PPO model.
 *
 * Integration: call getIncrementMs(state) at each yield point in DeltaScheduler
 * instead of adding the constant +10. Falls back to the +10 baseline if the
 * lookup table is unavailable or the inputs are invalid.
 */

import lookupData from "./lookup_table.json";

export interface SchedulingState {
	/** Ops still in the inbound queue after the most recent turn. */
	opsRemaining: number;
	/** 1-indexed turn number that just completed (i.e. next turn is `turnNumber + 1`). */
	turnNumber: number;
	/** Current per-turn time budget in ms (the value the policy is about to add to). */
	allowedTimeMs: number;
	/** Throughput observed during turn 1, in ops/ms (= turn-1 opsProcessed / 50). */
	t1Throughput: number;
	/** setTimeout resolution delay observed after turn 1, in ms — JS thread contention signal. */
	t1TimeToResumeMs: number;
	/** Total ops in this scheduling session (captured at session start). */
	initialTotalOps: number;
	/** Naive turn estimate from turn 1: ceil(t1_ops_remaining / t1_ops_processed). Fixed per session. */
	impliedTurnsNaive: number;
	/** Fraction of the session still remaining: opsRemaining / initialTotalOps. */
	remainingFraction: number;
}

interface LookupTable {
	feature_order: readonly string[];
	bin_edges: Readonly<Record<string, ReadonlyArray<number | null>>>; // null = +Infinity
	bin_counts: readonly number[];
	actions: readonly number[];
	table: readonly number[];
}

const TABLE = lookupData as LookupTable;

/** Baseline behavior — what DeltaScheduler does today. Used as the fallback. */
const DEFAULT_INCREMENT_MS = 10;

/**
 * Find the bin index for a value given right-exclusive edges (null = +Infinity).
 * Returns -1 if value is below the first edge (caller should treat as invalid).
 */
function findBin(value: number, edges: ReadonlyArray<number | null>): number {
	if (!Number.isFinite(value) || value < (edges[0] ?? 0)) {
		return -1;
	}
	for (let i = 0; i < edges.length - 1; i++) {
		const hi = edges[i + 1];
		if (hi === null || value < hi) {
			return i;
		}
	}
	return edges.length - 2; // clamp to the last bin
}

/**
 * Compute the next per-turn time-budget increment in ms.
 *
 * Returns one of [0, 5, 10, 20, 40, 80] based on the learned policy. Falls back
 * to the baseline +10ms if any input is invalid or the table is malformed.
 */
export function getIncrementMs(state: SchedulingState): number {
	const featureValues: Record<string, number> = {
		ops_remaining: state.opsRemaining,
		turn_number: state.turnNumber,
		allowed_time_ms: state.allowedTimeMs,
		t1_throughput: state.t1Throughput,
		t1_time_to_resume: state.t1TimeToResumeMs,
		initial_total_ops: state.initialTotalOps,
		implied_turns_naive: state.impliedTurnsNaive,
		remaining_fraction: state.remainingFraction,
	};

	let flatIndex = 0;
	for (let dim = 0; dim < TABLE.feature_order.length; dim++) {
		const feature = TABLE.feature_order[dim];
		const value = featureValues[feature];
		const edges = TABLE.bin_edges[feature];
		const binCount = TABLE.bin_counts[dim];

		const bin = findBin(value, edges);
		if (bin < 0) {
			return DEFAULT_INCREMENT_MS;
		}
		flatIndex = flatIndex * binCount + bin;
	}

	const actionIndex = TABLE.table[flatIndex];
	const increment = TABLE.actions[actionIndex];
	return increment ?? DEFAULT_INCREMENT_MS;
}

/** Exported for unit tests — do not use in scheduling hot path. */
export const _internal = { findBin, DEFAULT_INCREMENT_MS };
