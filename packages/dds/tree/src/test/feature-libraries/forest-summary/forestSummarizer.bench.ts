/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IsoBuffer } from "@fluid-internal/client-utils";
import {
	BenchmarkType,
	benchmarkCustom,
	type IMeasurementReporter,
} from "@fluid-tools/benchmark";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { IExperimentalIncrementalSummaryContext } from "@fluidframework/runtime-definitions/internal";

import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { FluidClientVersion, type CodecWriteOptions } from "../../../codec/index.js";
import {
	ForestSummarizer,
	TreeCompressionStrategy,
	TreeCompressionStrategyExtended,
	defaultSchemaPolicy,
	makeFieldBatchCodec,
	type FieldBatchEncodingContext,
	type IncrementalEncodingPolicy,
} from "../../../feature-libraries/index.js";
import {
	checkoutWithContent,
	fieldCursorFromInsertable,
	testIdCompressor,
	testRevisionTagCodec,
	configureBenchmarkHooks,
	type TreeStoredContentStrict,
} from "../../utils.js";
import { ForestTypeOptimized, type TreeCheckout } from "../../../shared-tree/index.js";
import {
	getShouldIncrementallySummarizeAllowedTypes,
	incrementalSummaryHint,
	permissiveStoredSchemaGenerationOptions,
	SchemaFactoryAlpha,
	toStoredSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { fieldJsonCursor } from "../../json/index.js";

/**
 * Creates a ForestSummarizer configured for the given compression strategy.
 */
function createForestSummarizer(args: {
	encodeType: TreeCompressionStrategy | TreeCompressionStrategyExtended;
	initialContent?: TreeStoredContentStrict;
	shouldEncodeIncrementally?: IncrementalEncodingPolicy;
}): { forestSummarizer: ForestSummarizer; checkout: TreeCheckout } {
	const { initialContent, encodeType, shouldEncodeIncrementally } = args;
	const options: CodecWriteOptions = {
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_73,
	};
	const fieldBatchCodec = makeFieldBatchCodec(options);
	const checkout = checkoutWithContent(
		initialContent ?? {
			schema: toStoredSchema(
				SchemaFactoryAlpha.number,
				permissiveStoredSchemaGenerationOptions,
			),
			initialTree: fieldJsonCursor([]),
		},
		{
			forestType: ForestTypeOptimized,
			shouldEncodeIncrementally,
		},
	);
	const encoderContext: FieldBatchEncodingContext = {
		encodeType,
		idCompressor: testIdCompressor,
		originatorId: testIdCompressor.localSessionId,
		schema: {
			schema: initialContent?.schema ?? checkout.storedSchema,
			policy: defaultSchemaPolicy,
		},
	};
	return {
		checkout,
		forestSummarizer: new ForestSummarizer(
			checkout.forest,
			testRevisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
			testIdCompressor,
			0 /* initialSequenceNumber */,
			shouldEncodeIncrementally,
		),
	};
}

/**
 * Measures and reports the size of a summary tree.
 */
function measureSummarySize(
	summary: ISummaryTree,
	reporter: IMeasurementReporter,
	context: string,
): number {
	const summaryString = JSON.stringify(summary);
	const summarySize = IsoBuffer.from(summaryString).byteLength;
	reporter.addMeasurement(`${context}_summarySize`, summarySize);
	return summarySize;
}

describe.only("ForestSummarizer - Incremental Summary Size Benchmarks", () => {
	configureBenchmarkHooks();

	const sf = new SchemaFactoryAlpha("IncrementalSummarizationBench");

	/**
	 * Schema for multi-depth tree structure used in benchmarks.
	 * The property `bar` will be incrementally summarized.
	 */
	class FooItem extends sf.objectAlpha("fooItem", {
		id: sf.number,
		bar: sf.types([{ type: sf.string, metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	}) {}

	/**
	 * Every item in this array will be incrementally summarized.
	 */
	class MyFooArray extends sf.arrayAlpha(
		"myFooArray",
		sf.types([{ type: FooItem, metadata: {} }], {
			custom: { [incrementalSummaryHint]: true },
		}),
	) {}

	class Root extends sf.objectAlpha("root", {
		rootId: sf.number,
		fooArray: MyFooArray,
	}) {}

	/**
	 * Creates an initial Root object with the specified number of items.
	 */
	function createInitialBoard(itemsCount: number): Root {
		let nextItemId = 10;
		const fooArray: FooItem[] = [];
		for (let i = 0; i < itemsCount; i++) {
			fooArray.push(
				new FooItem({
					id: nextItemId,
					bar: `Item ${nextItemId} bar content that makes the summary larger`,
				}),
			);
			nextItemId += 10;
		}
		return new Root({
			rootId: 1,
			fooArray,
		});
	}

	/**
	 * Test cases with varying numbers of items to measure incremental summary benefits.
	 */
	// const itemCounts = [10, 50, 100, 200];
	const itemCounts = [500];

	for (const itemsCount of itemCounts) {
		benchmarkCustom({
			type: BenchmarkType.Measurement,
			title: `Summary size comparison for ${itemsCount} items - Without Incremental`,
			run: async (reporter) => {
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursorFromInsertable(Root, createInitialBoard(itemsCount)),
				};

				// Create summarizer without incremental summarization
				const { forestSummarizer } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategy.Compressed,
				});

				// First summary
				const summary1 = forestSummarizer.summarize({ stringify: JSON.stringify });
				const size1 = measureSummarySize(
					summary1.summary,
					reporter,
					"first_without_incremental",
				);

				// Second summary (no changes) - should be same size
				const summary2 = forestSummarizer.summarize({ stringify: JSON.stringify });
				const size2 = measureSummarySize(
					summary2.summary,
					reporter,
					"second_without_incremental",
				);

				reporter.addMeasurement("without_incremental_size_reduction_percent", 0);
				assert(size1 > 0 && size2 > 0, "Summary sizes should be positive");
			},
		});

		benchmarkCustom({
			type: BenchmarkType.Measurement,
			title: `Summary size comparison for ${itemsCount} items - With Incremental`,
			run: async (reporter) => {
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursorFromInsertable(Root, createInitialBoard(itemsCount)),
				};

				const shouldEncodeIncrementally = getShouldIncrementallySummarizeAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: Root }),
				);

				// Create summarizer with incremental summarization
				const { forestSummarizer } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					shouldEncodeIncrementally,
				});

				// First summary
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				const size1 = measureSummarySize(summary1.summary, reporter, "first_with_incremental");

				// Second summary (no changes) - should use handles and be much smaller
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});
				const size2 = measureSummarySize(
					summary2.summary,
					reporter,
					"second_with_incremental",
				);

				// Calculate size reduction percentage
				const reduction = ((size1 - size2) / size1) * 100;
				reporter.addMeasurement("with_incremental_size_reduction_percent", reduction);
				assert(size2 < size1, "Second incremental summary should be smaller");
			},
		});

		benchmarkCustom({
			type: BenchmarkType.Measurement,
			title: `Summary size comparison for ${itemsCount} items - With Incremental (1 item changed)`,
			run: async (reporter) => {
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursorFromInsertable(Root, createInitialBoard(itemsCount)),
				};

				const shouldEncodeIncrementally = getShouldIncrementallySummarizeAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: Root }),
				);

				// Create summarizer with incremental summarization
				const { forestSummarizer, checkout } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					shouldEncodeIncrementally,
				});

				// First summary
				const incrementalSummaryContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summary1 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext1,
				});
				const size1 = measureSummarySize(summary1.summary, reporter, "first_with_incremental");

				// Make a change to one item
				const view = checkout.viewWith(new TreeViewConfiguration({ schema: Root }));
				const root = view.root;
				const firstItem = root.fooArray.at(0);
				assert(firstItem !== undefined, "Could not find first item");
				firstItem.bar = "Updated bar content";

				// Second summary (one item changed) - should have handles for unchanged items
				const incrementalSummaryContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summary2 = forestSummarizer.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incrementalSummaryContext2,
				});
				const size2 = measureSummarySize(
					summary2.summary,
					reporter,
					"second_with_incremental_one_change",
				);

				// Calculate size reduction percentage
				const reduction = ((size1 - size2) / size1) * 100;
				reporter.addMeasurement(
					"with_incremental_one_change_size_reduction_percent",
					reduction,
				);
				assert(
					size2 < size1,
					"Second incremental summary should be smaller even with one change",
				);
			},
		});
	}

	// Benchmark to compare all three scenarios side-by-side
	for (const itemsCount of itemCounts) {
		benchmarkCustom({
			type: BenchmarkType.Measurement,
			title: `Summary size comparison for ${itemsCount} items - All scenarios`,
			run: async (reporter) => {
				const initialContent: TreeStoredContentStrict = {
					schema: toStoredSchema(Root, permissiveStoredSchemaGenerationOptions),
					initialTree: fieldCursorFromInsertable(Root, createInitialBoard(itemsCount)),
				};

				// Scenario 1: Without incremental summarization
				const { forestSummarizer: forestSummarizer1 } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategy.Compressed,
				});

				const summaryNoInc1 = forestSummarizer1.summarize({ stringify: JSON.stringify });
				const sizeNoInc1 = measureSummarySize(
					summaryNoInc1.summary,
					reporter,
					"no_incremental_first",
				);

				const summaryNoInc2 = forestSummarizer1.summarize({ stringify: JSON.stringify });
				const sizeNoInc2 = measureSummarySize(
					summaryNoInc2.summary,
					reporter,
					"no_incremental_second",
				);

				// Scenario 2: With incremental summarization (no changes)
				const shouldEncodeIncrementally = getShouldIncrementallySummarizeAllowedTypes(
					new TreeViewConfigurationAlpha({ schema: Root }),
				);

				const { forestSummarizer: forestSummarizer2 } = createForestSummarizer({
					initialContent,
					encodeType: TreeCompressionStrategyExtended.CompressedIncremental,
					shouldEncodeIncrementally,
				});

				const incContext1: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 0,
					latestSummarySequenceNumber: -1,
					summaryPath: "",
				};
				const summaryInc1 = forestSummarizer2.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incContext1,
				});
				const sizeInc1 = measureSummarySize(
					summaryInc1.summary,
					reporter,
					"incremental_first",
				);

				const incContext2: IExperimentalIncrementalSummaryContext = {
					summarySequenceNumber: 10,
					latestSummarySequenceNumber: 0,
					summaryPath: "",
				};
				const summaryInc2 = forestSummarizer2.summarize({
					stringify: JSON.stringify,
					incrementalSummaryContext: incContext2,
				});
				const sizeInc2 = measureSummarySize(
					summaryInc2.summary,
					reporter,
					"incremental_second_no_changes",
				);

				// Calculate improvements
				const improvementNoChanges = ((sizeNoInc2 - sizeInc2) / sizeNoInc2) * 100;
				reporter.addMeasurement("improvement_no_changes_percent", improvementNoChanges);

				// Report comparison metrics
				reporter.addMeasurement("size_ratio_second_summary", sizeInc2 / sizeNoInc2);
				assert(sizeInc2 < sizeNoInc2, "Incremental summary should be smaller");
			},
		});
	}
});
