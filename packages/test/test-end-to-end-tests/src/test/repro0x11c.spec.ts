/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	AgentSchedulerFactory,
	IAgentScheduler,
} from "@fluidframework/agent-scheduler/internal";
import {
	ContainerRuntimeFactoryWithDefaultDataStore,
	DataObject,
	DataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

class TestDataObject2 extends DataObject {
	public get containerRuntime() {
		return this.context.containerRuntime;
	}

	public get _root() {
		return this.root;
	}
}

const testDataObject2Factory = new DataObjectFactory(
	"TestDataObject2",
	TestDataObject2,
	[],
	{},
);
const agentSchedulerFactory2 = new AgentSchedulerFactory();

const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore({
	defaultFactory: testDataObject2Factory,
	registryEntries: [
		[testDataObject2Factory.type, Promise.resolve(testDataObject2Factory)],
		[agentSchedulerFactory2.type, Promise.resolve(agentSchedulerFactory2)],
	],
});

describeCompat("0x11c", "NoCompat", (getTestObjectProvider, apis) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	it("repro 0x11c", async () => {
		const container = await provider.createContainer(runtimeFactory);
		const defaultObject = (await container.getEntryPoint()) as TestDataObject2;
		const schedulerDO = await defaultObject.containerRuntime.createDataStore(
			agentSchedulerFactory2.type,
		);
		const scheduler = (await schedulerDO.entryPoint.get()) as IAgentScheduler;
		assert(scheduler !== undefined, "Scheduler should be defined");

		const quorum = defaultObject.containerRuntime.getQuorum();
		const removeMemberP = new Promise<void>((resolve) => {
			quorum.on("removeMember", () => {
				resolve();
			});
		});

		const container2 = await provider.loadContainer(runtimeFactory);
		const defaultObject2 = (await container2.getEntryPoint()) as TestDataObject2;
		defaultObject2._root.set("test", "test");
		await provider.ensureSynchronized();
		container2.close();

		await removeMemberP;
		assert(true, "No exception should be thrown");
	});
});
