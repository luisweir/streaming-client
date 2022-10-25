import { log } from './logger.js';
import WebSocket from 'ws';
import { Client, createClient as createWSClient, SubscribePayload } from 'graphql-ws';
import { Call } from './Call.js';

export class GraphQlSubClient {

    public client: Client;
    public offset: string | undefined ;

    public constructor(env: any, wsUrl: string, oauthUrl: string, oauthOptions: any, call: Call) {
        let activeSocket: WebSocket, timedOut: any;
        this.client = createWSClient({
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
                    log.info(`Connected to socket ${wsUrl}`);
                    setTimeout(() => {
                        log.info('Refreshing connection with new token');
                        activeSocket.close(4408, 'Token Expired');
                    }, env.TOKEN_EXPIRY );
                },
                closed: (event: any) => {
                    log.error(`Socket closed with event ${event.code} ${event.reason}`);
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
                },
                error: (error: any) => {
                    log.error(error);
                }
            }
        });
    }

    // generate GraphQL Subscription query
    private genQuery(chainCode: string | undefined, offset?: number | undefined, hotelCode?: string | undefined, delta?: boolean): any {
        const query = `subscription {
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
        return query.replace(/\s+/g, ' ').trim();
    }

    // Function to start the connection
    public async execute<T>(env: any) {
        const payload: SubscribePayload = this.genQuery(env.CHAIN,env.OFFSET,env.HOTELID,env.DELTA);
        return new Promise<T>((resolve, reject) => {
            let result: any;
            log.info(`Subscribing to ${payload}`);
            this.client.subscribe<T>(payload, {
                next: (data) => {
                    result = data;
                    log.info(`Processed ${result.data.newEvent.eventName} event with: offset ${result.data.newEvent.metadata.offset}, primaryKey ${result.data.newEvent.primaryKey}, HotelId ${result.data.newEvent.hotelId}`);
                },
                error: (error) => {
                    log.error(error);
                    reject();
                },
                complete: () => resolve(result)
            });
        });
    }
}