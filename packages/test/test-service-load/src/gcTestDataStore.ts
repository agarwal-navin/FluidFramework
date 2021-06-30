/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import {ISharedCounter, SharedCounter} from "@fluidframework/counter";
import { assert } from "@fluidframework/common-utils";

export interface IGCTestDataStore {
    /** Modifies the data store by performing certain operations on its data */
    modify(): void;
}

export class GCTestDataStore extends DataObject implements IGCTestDataStore {
    public static DataStoreName = "GCTestDataStore";

    private readonly counterKey = "counter";
    private counter!: ISharedCounter;

    protected async initializingFirstTime(): Promise<void> {
        this.root.set(this.counterKey, SharedCounter.create(this.runtime).handle);
    }

    protected async hasInitialized(): Promise<void> {
        const c = await this.root.get<IFluidHandle<ISharedCounter>>(this.counterKey)?.get();
        assert(c !== undefined, "Could not find counter in GC data store");
        this.counter = c;
    }

    public modify() {
        this.counter.increment(1);
    }
}

export const GCTestDataStoreInstantiationFactory = new DataObjectFactory(
    GCTestDataStore.DataStoreName,
    GCTestDataStore,
    [
        SharedCounter.getFactory(),
    ],
    {},
);
