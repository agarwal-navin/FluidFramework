/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { v4 as uuid } from "uuid";
import { assert } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader, IFluidResolvedUrl, IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { getRandomName } from "@fluidframework/server-services-client";

export function generateUser() {
    const randomUser = {
        id: uuid(),
        name: getRandomName(" ", true),
    };

    return randomUser;
}

export class FRSUrlResolver implements IUrlResolver {
    constructor(
        private readonly hostUrl: string,
        private readonly tenantId: string,
        private readonly frsAccessToken: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        let fullPath: string;
        let documentId: string;

        if (request.headers?.[DriverHeader.createNew]) {
            const [, queryString] = request.url.split("?");

            const searchParams = new URLSearchParams(queryString);
            const fileName = searchParams.get("fileName");
            if (!fileName) {
                throw new Error("FileName should be there!!");
            }
            fullPath = fileName;
            documentId = fileName;
        } else {
            const url = new URL(request.url);
            fullPath = url.pathname.substr(1);
            documentId = fullPath.split("/")[0];
        }

        return {
            endpoints: {
                storageUrl: `https://historian.${this.hostUrl}/repos/${this.tenantId}`,
                deltaStorageUrl: `https://alfred.${this.hostUrl}/deltas/${this.tenantId}/${documentId}`,
                ordererUrl: `https://alfred.${this.hostUrl}`,
            },
            tokens: { jwt: this.frsAccessToken },
            type: "fluid",
            url: `fluid://alfred.${this.hostUrl}/${this.tenantId}/${fullPath}`,
        };
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        const fluidResolvedUrl = resolvedUrl as IFluidResolvedUrl;

        const parsedUrl = parse(fluidResolvedUrl.url);
        const [, , documentId] = parsedUrl.pathname?.split("/");
        assert(!!documentId);

        let url = relativeUrl;
        if (url.startsWith("/")) {
            url = url.substr(1);
        }

        return `https://alfred.${this.hostUrl}/${this.tenantId}/${documentId}/${url}`;
    }

    public createCreateNewRequest(fileName: string): IRequest {
        const createNewRequest: IRequest = {
            url: `https://alfred.${this.hostUrl}?fileName=${fileName}`,
            headers: {
                [DriverHeader.createNew]: true,
            },
        };
        return createNewRequest;
    }
}
