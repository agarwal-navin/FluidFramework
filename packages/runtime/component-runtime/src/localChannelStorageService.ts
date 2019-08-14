/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBlob, ITree, TreeEntry } from "@prague/protocol-definitions";
import { IObjectStorageService } from "@prague/runtime-definitions";

export class LocalChannelStorageService implements IObjectStorageService {
    constructor(private readonly tree: ITree) {
    }

    public async read(path: string): Promise<string> {
        const contents = this.readSync(path);
        return contents !== undefined ? Promise.resolve(contents) : Promise.reject("Not found");
    }

    /**
     * Provides a synchronous access point to locally stored data
     */
    private readSync(path: string): string | undefined {
        return this.readSyncInternal(path, this.tree);
    }

    private readSyncInternal(path: string, tree: ITree): string | undefined {
        for (const entry of tree.entries) {
            switch (entry.type) {
                case TreeEntry[TreeEntry.Blob]:
                    if (path === entry.path) {
                        const blob = entry.value as IBlob;
                        return blob.encoding === "utf-8"
                            ? Buffer.from(blob.contents).toString("base64")
                            : blob.contents;
                    }
                    break;

                case TreeEntry[TreeEntry.Tree]:
                    if (path.indexOf(entry.path) === 0) {
                        return this.readSyncInternal(path.substr(entry.path.length + 1), entry.value as ITree);
                    }
                    break;

                default:
            }
        }

        return undefined;
    }
}
