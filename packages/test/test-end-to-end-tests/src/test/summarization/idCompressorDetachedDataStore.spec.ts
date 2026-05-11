/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type { IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import {
	ITestObjectProvider,
	createContainerRuntimeFactoryWithDefaultDataStore,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils/internal";
import {
	ITree,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

const sf = new SchemaFactory("idCompressorDetachedDataStoreTest");
class Item extends sf.object("Item", {
	label: sf.string,
}) {}
class Root extends sf.object("Root", {
	items: sf.array(Item),
}) {}

const treeConfig = new TreeViewConfiguration({ schema: Root });

/**
 * Default data store; provides a root SharedDirectory where a handle to the
 * detached data store will be stored to trigger its attach.
 */
class DefaultDataObject extends DataObject {
	public static readonly Name = "DefaultDataObject";

	public get containerRuntime(): IContainerRuntimeBase {
		return this.context.containerRuntime;
	}

	public storeHandle(key: string, handle: IFluidHandle): void {
		this.root.set(key, handle);
	}

	public getStoredHandle<T>(key: string): IFluidHandle<T> | undefined {
		return this.root.get<IFluidHandle<T>>(key);
	}
}

const defaultFactory = new DataObjectFactory({
	type: DefaultDataObject.Name,
	ctor: DefaultDataObject,
});

/**
 * Data store that owns a SharedTree. Its first-time initialization runs
 * inside the detached creation flow (`createInstanceWithDataStore` then
 * `instantiateDataStore` then `initializingFirstTime`), so the tree mutations
 * happen while the data store is genuinely detached. The id compressor
 * therefore allocates only local (negative / not-yet-finalized) ids.
 */
class TreeOwningDataObject extends DataObject {
	public static readonly Name = "TreeOwningDataObject";
	private static readonly treeChannelId = "tree";

	#treeView: TreeView<typeof Root> | undefined;

	public get treeView(): TreeView<typeof Root> {
		assert(this.#treeView !== undefined, "treeView has not been initialized");
		return this.#treeView;
	}

	public get dataStoreRuntime(): IFluidDataStoreRuntime {
		return this.runtime;
	}

	protected override async initializingFirstTime(): Promise<void> {
		// Create the SharedTree channel while the data store is detached.
		const channel = this.runtime.createChannel(
			TreeOwningDataObject.treeChannelId,
			SharedTree.getFactory().type,
		);
		(channel as unknown as ISharedObject).bindToContext();
		const tree = channel as unknown as ITree;

		// Initialize and mutate while detached. Each inserted node causes
		// the runtime's id compressor to allocate a local (negative)
		// compressed id because no finalize op has been observed yet.
		const view = tree.viewWith(treeConfig);
		view.initialize({ items: [] });
		view.root.items.insertAtEnd(
			new Item({ label: "a" }),
			new Item({ label: "b" }),
			new Item({ label: "c" }),
		);
		this.#treeView = view;
	}

	protected override async hasInitialized(): Promise<void> {
		if (this.#treeView === undefined) {
			const tree = (await this.runtime.getChannel(
				TreeOwningDataObject.treeChannelId,
			)) as unknown as ITree;
			this.#treeView = tree.viewWith(treeConfig);
		}
	}
}

const treeOwningFactory = new DataObjectFactory({
	type: TreeOwningDataObject.Name,
	ctor: TreeOwningDataObject,
	sharedObjects: [SharedTree.getFactory()],
});

describeCompat(
	"SharedTree in a data store created detached and attached via op",
	"NoCompat",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;

		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(
			ContainerRuntimeFactoryWithDefaultDataStore,
			{
				defaultFactory,
				registryEntries: [
					[defaultFactory.type, Promise.resolve(defaultFactory)],
					[treeOwningFactory.type, Promise.resolve(treeOwningFactory)],
				],
				runtimeOptions: {
					// SharedTree requires the runtime id compressor.
					enableRuntimeIdCompressor: "on",
				},
			},
		);

		it("Summarizer creates the data store from the attach op summary and a new container can load and edit the tree", async () => {
			// 1. Create a container with an attached default data store.
			const container1 = await provider.createContainer(runtimeFactory);
			const defaultDataObject =
				(await container1.getEntryPoint()) as DefaultDataObject;
			const containerRuntime = defaultDataObject.containerRuntime;

			// 2. Create the data store *detached*. The factory uses
			//    `createDetachedDataStore` + `attachRuntime` internally, and
			//    the data object's `initializingFirstTime` (which creates and
			//    mutates the SharedTree) runs while the data store is still
			//    detached.
			const [treeDataObject, treeDataStore] =
				await treeOwningFactory.createInstanceWithDataStore(containerRuntime);

			// Sanity-check: the tree was populated during detached init.
			assert.deepEqual(
				treeDataObject.treeView.root.items.map((item) => item.label),
				["a", "b", "c"],
				"items inserted during detached init should be present",
			);

			// Sanity-check: the id compressor only has local (negative) ids
			// because the data store has not been attached yet, so no
			// finalize op has been observed.
			const idCompressor = treeDataObject.dataStoreRuntime.idCompressor;
			assert(idCompressor !== undefined, "id compressor must be enabled on the runtime");
			const localId = idCompressor.generateCompressedId();
			assert(
				(localId as unknown as number) < 0,
				"generated id should be local (negative) while data store is detached",
			);

			// 3. Attach the detached data store by referencing its handle from
			//    the (attached) default data store. This produces an attach op
			//    that carries the data store's initial summary (including the
			//    SharedTree summary, which encodes the local ids).
			defaultDataObject.storeHandle("treeDataStore", treeDataObject.handle);
			// Keep the IDataStore reference reachable so it isn't GC'd.
			void treeDataStore;

			await provider.ensureSynchronized();

			// 4. Create a summarizer (which loads the data store from the
			//    attach op's summary) and run an on-demand summary.
			const { summarizer } = await createSummarizerFromFactory(
				provider,
				container1,
				defaultFactory,
				undefined /* summaryVersion */,
				ContainerRuntimeFactoryWithDefaultDataStore,
				[
					[defaultFactory.type, Promise.resolve(defaultFactory)],
					[treeOwningFactory.type, Promise.resolve(treeOwningFactory)],
				],
			);
			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer, "afterDetachedAttach");


			const { summaryVersion: summaryVersion2 } = await summarizeNow(summarizer, "afterDetachedAttach");

			// 5. Load a new container from this summary.
			const container2 = await provider.loadContainer(runtimeFactory, undefined, {
				[LoaderHeader.version]: summaryVersion,
			});
			const defaultDataObject2 =
				(await container2.getEntryPoint()) as DefaultDataObject;
			const handle =
				defaultDataObject2.getStoredHandle<TreeOwningDataObject>("treeDataStore");
			assert(isFluidHandle(handle), "expected handle to attached data store");
			const treeDataObjectFromSummary = await handle.get();

			// 6. Operate on the SharedTree in the new container.
			const view2 = treeDataObjectFromSummary.treeView;
			assert(view2.compatibility.canView, "loaded tree should be view-compatible");
			assert.deepEqual(
				view2.root.items.map((item) => item.label),
				["a", "b", "c"],
				"items inserted while detached should be present after summary round-trip",
			);

			view2.root.items.insertAtEnd(new Item({ label: "d" }));
			assert.deepEqual(
				view2.root.items.map((item) => item.label),
				["a", "b", "c", "d"],
				"newly inserted item should be visible after edit",
			);
		});
	},
);
