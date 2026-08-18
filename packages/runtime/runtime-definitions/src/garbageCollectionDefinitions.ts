/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The key for the GC tree in summary.
 *
 * @internal
 */
export const gcTreeKey = "gc";
/**
 * The prefix for GC blobs in the GC tree in summary.
 *
 * @internal
 */
export const gcBlobPrefix = "__gc";
/**
 * The key for tombstone blob in the GC tree in summary.
 *
 * @internal
 */
export const gcTombstoneBlobKey = "__tombstones";
/**
 * The key for deleted nodes blob in the GC tree in summary.
 *
 * @internal
 */
export const gcDeletedBlobKey = "__deletedNodes";
/**
 * The key for the GC Data blob in attach summaries.
 *
 * @internal
 */
export const gcDataBlobKey = ".gcdata";

/**
 * Garbage collection data returned by nodes in a Container.
 * Used for running GC in the Container.
 * @legacy @beta
 */
export interface IGarbageCollectionData {
	/**
	 * The GC nodes of a Fluid object in the Container. Each node has an id and a set of routes to other GC nodes.
	 */
	gcNodes: { [id: string]: string[] };
}

/**
 * GC details provided to each node during creation.
 * @legacy @beta
 */
export interface IGarbageCollectionDetailsBase {
	/**
	 * A list of routes to Fluid objects that are used in this node.
	 */
	usedRoutes?: string[];
	/**
	 * The GC data of this node.
	 */
	gcData?: IGarbageCollectionData;
}

/**
 * Builds the garbage collection data of a container as a tree that mirrors the node hierarchy, so that a node
 * whose data has not changed can be skipped entirely instead of regenerating its part of the graph.
 *
 * @remarks
 * Each builder owns one absolute node path. Ids passed to {@link IGCDataBuilder.addNode} are relative to that
 * path, so a node never needs to know where it sits in the container. A node that has not changed calls
 * {@link IGCDataBuilder.nodeDidNotChange} instead of adding anything, and the garbage collector fills its
 * subtree in from the previous run's graph.
 *
 * @legacy @beta
 */
export interface IGCDataBuilder {
	/**
	 * Creates a builder for a child node. The child's node ids are nested under this node's path.
	 * @param childId - The child's id relative to this node. Should not contain any "/" characters.
	 */
	createBuilderForChild(childId: string): IGCDataBuilder;

	/**
	 * Adds a node with the given outbound routes.
	 * @param id - The node's id relative to this builder's path. "/" refers to this builder's own node.
	 */
	addNode(id: string, outboundRoutes: readonly string[]): void;

	/**
	 * Adds each of the given nodes, whose ids are relative to this builder's path.
	 */
	addNodes(gcNodes: { readonly [id: string]: readonly string[] }): void;

	/**
	 * Adds the given outbound route to every node added under this builder's path so far.
	 *
	 * @remarks
	 * Children that reported no change are not affected - the route is already present in the data being reused.
	 */
	addRouteToAllNodes(outboundRoute: string): void;

	/**
	 * Declares that this node's garbage collection data has not changed since the reference point it was given,
	 * so the previous run's data for this node and everything below it should be reused.
	 *
	 * @remarks
	 * Must not be called on the root builder, and must not be called after any node has been added to this builder.
	 */
	nodeDidNotChange(): void;
}
