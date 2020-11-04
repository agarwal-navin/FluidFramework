/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios from "axios";
import { assert } from "@fluidframework/common-utils";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import { IDevServerUser } from "./loader";

/**
 * As the name implies this is not secure and should not be used in production. It simply makes the example easier
 * to get up and running.
 */
export class FRSTokenProvider implements ITokenProvider {
    constructor(
        private readonly documentId: string,
        private readonly user: IDevServerUser,
    ) {

    }

    public async fetchOrdererToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: await this.getFRSToken(),
        };
    }

    public async fetchStorageToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: await this.getFRSToken(),
        };
    }

    private async getFRSToken(): Promise<string> {
        const tokenServer = "https://authfluidwindows.azurewebsites.net/api/FRSToken";
        const requestConfig = {
            params: { documentId: this.documentId, user: JSON.stringify(this.user) },
        };
        const response = await axios.get(tokenServer, requestConfig);
        assert(response.status === 200, "Could not fetch token from server");
        return response.data.token as string;
    }
}
