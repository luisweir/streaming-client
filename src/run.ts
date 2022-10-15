/* eslint-disable @typescript-eslint/no-explicit-any */
import dotenv from 'dotenv';
import { createClient as createWSClient, SubscribePayload } from 'graphql-ws';
import WebSocket from 'ws';
import { Call } from './Call.js';
import { Hasher } from './Hasher.js';

dotenv.config();

const env = {
    APIGW_URL: process.env.APIGW_URL || '',
    WS_URL: process.env.WS_URL || '',
    OAUTH_ENDPOINT: process.env.OAUTH_ENDPOINT || '',
    SUBS_ENDPOINT: process.env.SUBS_ENDPOINT || '',
    APP_KEY: process.env.APP_KEY || '',
    INTEGRATION_USER: process.env.INTEGRATION_USER || '',
    INTEGRATION_PASSWORD: process.env.INTEGRATION_PASSWORD || '',
    CLIENT_ID: process.env.CLIENT_ID || '',
    CLIENT_SECRET: process.env.CLIENT_SECRET || '',
    TOKEN_EXPIRY: Number(process.env.TOKEN_EXPIRY) || 3540000,
    PING: Number(process.env.TOKEN_EXPIRY) || 5000
};

// First step is to  obtain the OAuth Token
const method = 'POST';
const oauthOptions = {
    method,
    headers: {
        'x-app-key': env.APP_KEY,
        Authorization: 'Basic ' + Buffer.from(env.CLIENT_ID + ':' + env.CLIENT_SECRET).toString('base64')
    },
    form: {
        'username': env.INTEGRATION_USER,
        'password': env.INTEGRATION_PASSWORD,
        'grant_type': 'password'
    },
    timeout: {
        request: 30000
    },
    retry: {
        limit: 3
    }
};

const call: Call = new Call();
const oauthUrl = env.APIGW_URL + env.OAUTH_ENDPOINT;
const hasher: Hasher = new Hasher();
const hash = await hasher.generateHash(env.APP_KEY);
const wsUrl = env.WS_URL + env.SUBS_ENDPOINT + '?key=' + hash;
let activeSocket: WebSocket, timedOut: any;
function getQuery(chainCode: string, offset?: number, hotelCode?: string, delta?: boolean): any {
    return `subscription {
            newEvent (input:{chainCode: "${chainCode}" 
                ${ (offset!==undefined) ? `, offset: "${offset}"` : '' }
                ${ (hotelCode!==undefined) ? `, hotelCode: "${hotelCode}"` : '' }
                ${ (delta!==undefined) ? `, delta: "${delta}"` : '' }}){
                metadata {
                    offset
                    uniqueEventId
                }
                moduleName
                eventName
                primaryKey
                timestamp
                hotelId
                publisherId
                actionInstanceId
                detail {
                    elementName
                    elementType
                    elementSequence
                    elementRole
                    newValue
                    oldValue
                    scopeFrom
                    scopeTo
                }
            }
        }`;
}

// GraphQL Subscription client
const client = createWSClient({
    webSocketImpl: WebSocket,
    url: wsUrl,
    connectionParams: async() => {
        return {
            'Authorization': `Bearer ${(await call.getToken(oauthUrl, oauthOptions)).access_token}`,
            'x-app-key': `${env.APP_KEY}`
        };
    },
    shouldRetry: () => true,
    lazy: true,
    keepAlive: 10000,
    on: {
        connected: (socket: any) => {
            activeSocket = socket;
            console.log(`Connected to socket ${wsUrl}`);
            setTimeout(() => {
                console.log('Refreshing connection with new token');
                activeSocket.close(4408, 'Token Expired');
            }, env.TOKEN_EXPIRY );
        },
        closed: (event: any) => {
            console.error(`Socket closed with event ${event.code} ${event.reason}`);
        },
        ping: (received) => {
            if (!received) // sent
                timedOut = setTimeout(() => {
                    if (activeSocket.readyState === WebSocket.OPEN)
                        activeSocket.close(4408, 'Request Timeout');
                }, env.PING);
        },
        pong: (received) => {
            if (received) clearTimeout(timedOut); // pong is received, clear connection close timeout
        }
    }
});

// function to start the connection
async function execute<T>(payload: SubscribePayload) {
    return new Promise<T>((resolve, reject) => {
        let result: any;
        console.log(`Subscribing to ${JSON.stringify(payload).replace(/\s+/g, ' ').trim()}`);
        client.subscribe<T>(payload, {
            next: (data) => {
                result = data;
                console.log(`New ${result.data.newEvent.eventName} event with offset ${result.data.newEvent.metadata.offset}. HotelId ${result.data.newEvent.hotelId}, primaryKey ${result.data.newEvent.primaryKey}`);
            },
            error: reject,
            complete: () => resolve(result)
        });
    });
}

// start the connection
try {
    await execute({ query: getQuery('OHIPCN',undefined,'SAND01CN') });
} catch {
    console.log('Error establishing socket connection');
}



