/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ITree,
	ISignalMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

/**
 * An envelope wraps the contents with the intended target
 * @legacy
 * @alpha
 */
export interface IEnvelope {
	/**
	 * The target for the envelope
	 */
	address: string;

	/**
	 * The contents of the envelope
	 */
	contents: any;
}

/**
 * Represents ISignalMessage with its type.
 * @legacy
 * @alpha
 */
export interface IInboundSignalMessage extends ISignalMessage {
	readonly type: string;
}

/**
 * Message send by client attaching local data structure.
 * Contains snapshot of data structure which is the current state of this data structure.
 * @legacy
 * @alpha
 */
export interface IAttachMessage {
	/**
	 * The identifier for the object
	 */
	id: string;

	/**
	 * The type of object
	 */
	type: string;

	/**
	 * Initial snapshot of the document (contains ownership)
	 */
	snapshot: ITree;
}

/**
 * This type should be used when reading an incoming attach op,
 * but it should not be used when creating a new attach op.
 * Older versions of attach messages could have null snapshots,
 * so this gives correct typings for writing backward compatible code.
 * @legacy
 * @alpha
 */
export type InboundAttachMessage = Omit<IAttachMessage, "snapshot"> & {
	snapshot: IAttachMessage["snapshot"] | null;
};

/**
 * This is the message type that is used within the runtime when processing a sequenced message.
 * It is the same as ISequencedDocumentMessage, but without the contents and clientSequenceNumbers
 * which are sent separately. The contents are modified at multiple layers in the stack so having it
 * separate doesn't require packing and unpacking the entire message.
 * @alpha
 * @legacy
 */
export type ISequencedRuntimeMessageCore = Omit<
	ISequencedDocumentMessage,
	"contents" | "clientSequenceNumber"
>;

/**
 * These are the contents of a runtime message as it is processed throughout the stack.
 * @alpha
 * @legacy
 */
export interface IRuntimeMessageContents {
	contents: unknown;
	localOpMetadata: unknown;
	clientSequenceNumber: number;
}
