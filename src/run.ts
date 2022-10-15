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
    PING: Number(process.env.TOKEN_EXPIRY) || 5000,
    CHAIN: process.env.CHAIN,
    HOTELID: process.env.HOTELID,
    OFFSET: (process.env.OFFSET) ? Number(process.env.OFFSET) : undefined,
    DELTA: (process.env.DELTA==='true') ? true : false
};

// required to fetch OAuth Token
const call: Call = new Call();
const method = 'POST';
const oauthUrl = env.APIGW_URL + env.OAUTH_ENDPOINT;
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

// required for establishing socket connection
const hasher: Hasher = new Hasher();
const hash = await hasher.generateHash(env.APP_KEY);
const wsUrl = env.WS_URL + env.SUBS_ENDPOINT + '?key=' + hash;
let activeSocket: WebSocket, timedOut: any;
// modify query as required
function getQuery(chainCode: string | undefined, offset?: number | undefined, hotelCode?: string | undefined, delta?: boolean): any {
    return `subscription {
            newEvent (input:{chainCode: "${chainCode}" 
                ${ (offset!==undefined) ? `, offset: "${offset}"` : '' }
                ${ (hotelCode!==undefined) ? `, hotelCode: "${hotelCode}"` : '' }
                ${ (delta!==undefined) ? `, delta: ${delta}` : '' }}){
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
            'Authorization': `Bearer ${(await call.fetchToken(oauthUrl, oauthOptions)).access_token}`,
            'x-app-key': `${env.APP_KEY}`
        };
    },
    shouldRetry: () => true,
    lazy: true,
    keepAlive: (env.PING), // frequency to ping server
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
                }, env.PING / 2); // if pong not received within this timeframe then recreate connection
        },
        pong: (received) => {
            if (received) clearTimeout(timedOut); // pong is received, clear connection close timeout
        }
    }
});

// Function to start the connection
async function execute<T>(payload: SubscribePayload) {
    return new Promise<T>((resolve, reject) => {
        let result: any;
        console.log(`Subscribing to ${JSON.stringify(payload).replace(/\s+/g, ' ').trim()}`);
        client.subscribe<T>(payload, {
            next: (data) => {
                result = data;
                console.log(`Processed ${result.data.newEvent.eventName} event with: offset ${result.data.newEvent.metadata.offset}, primaryKey ${result.data.newEvent.primaryKey}, HotelId ${result.data.newEvent.hotelId}`);
            },
            error: reject,
            complete: () => resolve(result)
        });
    });
}

// Start the connection
try {
    await execute({ query: getQuery(env.CHAIN,env.OFFSET,env.HOTELID,env.DELTA) });
} catch {
    console.log('Error establishing socket connection');
}



