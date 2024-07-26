/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISummaryBuilder,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions/internal";

export interface IParentSummaryTracker {
	createChild(
		id: string,
		lastProcessedSequenceNumber: number,
		summarizeInternal: (
			summaryBuilder: ISummaryBuilder,
			latestSummarySequenceNumber: number,
			fullTree: boolean,
			telemetryContext: ITelemetryContext,
		) => Promise<void>,
	): ISummaryTracker;
}

export interface ISummaryTracker {
	summarize2(
		summaryBuilder: ISummaryBuilder,
		latestSummarySequenceNumber: number,
		fullTree: boolean,
		telemetryContext: ITelemetryContext,
	): Promise<void>;
	processedMessage(messageSequenceNumber: number): void;
}

export class SummaryTracker implements ISummaryTracker {
	// public static createRoot(
	// 	telemetryId: string,
	// 	lastProcessedSequenceNumber: number,
	// 	summarizeInternal: (
	// 		summaryBuilder: ISummaryBuilder,
	// 		latestSummarySequenceNumber: number,
	// 		fullTree: boolean,
	// 		telemetryContext: ITelemetryContext,
	// 	) => Promise<void>,
	// ) {
	// 	return new SummaryTracker(telemetryId, lastProcessedSequenceNumber, summarizeInternal);
	// }

	// public createChild(
	// 	id: string,
	// 	lastProcessedSequenceNumber: number,
	// 	summarizeInternal: (
	// 		summaryBuilder: ISummaryBuilder,
	// 		latestSummarySequenceNumber: number,
	// 		fullTree: boolean,
	// 		telemetryContext: ITelemetryContext,
	// 	) => Promise<void>,
	// ): ISummaryTracker {}

	private constructor(
		public readonly id: string,
		private lastProcessedSequenceNumber: number,
		private readonly summarizeInternal: (
			summaryBuilder: ISummaryBuilder,
			latestSummarySequenceNumber: number,
			fullTree: boolean,
			telemetryContext: ITelemetryContext,
		) => Promise<void>,
	) {}

	public async summarize2(
		summaryBuilder: ISummaryBuilder,
		latestSummarySequenceNumber: number,
		fullTree: boolean,
		telemetryContext: ITelemetryContext,
	): Promise<void> {
		if (fullTree || this.lastProcessedSequenceNumber > latestSummarySequenceNumber) {
			await this.summarizeInternal(
				summaryBuilder,
				latestSummarySequenceNumber,
				fullTree,
				telemetryContext,
			);
			return;
		}
		summaryBuilder.completeSummary(false /* nodeChanged */);
	}

	public processedMessage(messageSequenceNumber: number) {
		this.lastProcessedSequenceNumber = messageSequenceNumber;
	}
}
