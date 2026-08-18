/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This feature indicates the ContainerRuntime will encode handles
 * If the Runtime layer supports this feature, the DataStore layer should not encode handles (but do bind them)
 *
 * @internal
 */
export const encodeHandlesInContainerRuntime = "encodeHandlesInContainerRuntime";

/**
 * This feature indicates that the datastore context will call notifyReadOnlyState on the
 * datastore runtime.
 * @internal
 */
export const notifiesReadOnlyState = "notifiesReadOnlyState";

/**
 * This feature indicates that the DataStore layer implements {@link ISummarizable} - both
 * {@link ISummarizable.generateSummary} and {@link ISummarizable.generateGCData}.
 *
 * @remarks
 * The builder-based summarize and GC flows are only used for a data store whose runtime advertises this. A data
 * store from a version that predates the API is summarized with `summarize` and contributes its full GC data via
 * `getGCData` instead, since it cannot report that it has not changed.
 *
 * @internal
 */
export const generateSummary = "generateSummary";
