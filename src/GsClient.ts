import { log } from './logger.js';
import WebSocket from 'ws';
import { Client, createClient as createWSClient, SubscribePayload } from 'graphql-ws';
import { Call } from './Call.js';
import { v4 as uuidv4 } from 'uuid';

enum bucketTypes {
    HOUR = 'HOUR',
    MINUTE = 'MINUTE',
    SECOND = 'SECOND'
}

interface IStrIndex {
    [index: string]: number;
}

export class GsClient {

    private offset: number;
    private env: any;
    private wsUrl: string;
    private oauthUrl: string;
    private oauthOptions: any;
    private call: Call;
    private activeSocket: WebSocket | null = null;
    private windowCount: number;
    private statsSummary: IStrIndex;
    private stats: IStrIndex;

    public constructor(env: any, wsUrl: string, oauthUrl: string, oauthOptions: any, call: Call) {
        this.offset = env.OFFSET;
        this.env = env;
        this.wsUrl = wsUrl;
        this.oauthUrl = oauthUrl;
        this.oauthOptions = oauthOptions;
        this.call = call;
        this.windowCount = 0;
        this.statsSummary = {};
        this.stats = {};
    }

    public getClient(): Client {
        log.debug('Creating client');
        let timedOut: any;
        const client: Client =  createWSClient({
            webSocketImpl: WebSocket,
            url: this.wsUrl,
            generateID: () => {
                const uuid = uuidv4();
                log.debug(`Generated id: ${uuid}`);
                return uuid;
            },
            connectionParams: async() => {
                log.debug(`Starting from offset ${ (this.offset) ? this.offset : 'latest'}`);
                let token;
                try {
                    log.silly('Fetching access token');
                    token = (await this.call.fetchToken(this.oauthUrl, this.oauthOptions)).access_token;
                    log.silly(`Fetched token: ${token}`);
                } catch {
                    log.error('Exiting application');
                    process.abort();
                }
                return {
                    'Authorization': `Bearer ${token}`,
                    'x-app-key': `${this.env.APP_KEY}`
                };
            },
            shouldRetry: () => true,
            lazy: true,
            keepAlive: (this.env.PING), // frequency to ping server
            on: {
                connecting: () => {
                    log.info(`Connecting to socket ${this.wsUrl}`);
                },
                connected: (socket: any) => {
                    this.activeSocket = socket;
                    log.debug('Connected to socket');
                },
                closed: (event: any) => {
                    log.info(`Socket closed with event ${event.code} ${event.reason}`);
                },
                ping: (received) => {
                    if (!received) // sent
                        timedOut = setTimeout(() => {
                            if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN)
                                this.activeSocket.close(4408, 'Request Timeout');
                        }, this.env.PING / 2); // if pong not received within this timeframe then recreate connection
                },
                pong: (received) => {
                    if (received) clearTimeout(timedOut); // pong is received, clear connection close timeout
                },
                error: (error) => {
                    log.error(error);
                }
            }
        });
        return client;
    }

    // generate GraphQL Subscription query
    private createQuery(chainCode: string | undefined, offset?: number | undefined, hotelCode?: string | undefined, delta?: boolean): any {
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
    public async subscribe<T>(client: Client): Promise<any>{
        const query = this.createQuery(this.env.CHAIN,this.offset,this.env.HOTELID,this.env.DELTA);
        const payload: SubscribePayload = {query};
        return new Promise<T>((resolve, reject) => {
            let result: any;
            log.info(`Posting ${query}`);
            if (client) {
                client.subscribe<T>(payload, {
                    next: (data) => {
                        result = data;
                        this.offset = Number(result.data.newEvent.metadata.offset) + 1;
                        this.setStat(result.data.newEvent.eventName);
                        log.debug(`${result.data.newEvent.eventName}, offset ${result.data.newEvent.metadata.offset}, primaryKey ${result.data.newEvent.primaryKey}${(result.data.newEvent.hotelId) ? `, HotelID: ${result.data.newEvent.hotelId}` : ''}, Created at: ${result.data.newEvent.timestamp}`);
                    },
                    error: (error) => {
                        reject(error);
                    },
                    complete: () => resolve(result)
                });
            }
        });
    }

    private setStat(eventName: string): void {
        this.windowCount = this.windowCount + 1; 
        // total events per event type
        if (!this.statsSummary[eventName]){
            this.statsSummary[eventName] = 1;
        } else {
            this.statsSummary[eventName] = this.statsSummary[eventName] + 1;
        }
         // total events per time bucket
        if (this.env.TIME_BUCKET !== undefined) {
            const now = new Date(Date.now());
            let timeBucket = '';
            switch (this.env.TIME_BUCKET) {
                case bucketTypes.HOUR:
                    timeBucket = `${now.getHours()}h`;
                    break;
                case bucketTypes.MINUTE:
                    timeBucket = `${now.getHours()}h:${now.getMinutes()}m`;
                    break;
                case bucketTypes.SECOND:
                    timeBucket = `${now.getHours()}h:${now.getMinutes()}m:${now.getSeconds()}s`;
                    break;
            }
            if (!this.stats[timeBucket]){
                this.stats[timeBucket] = 1;
            } else {
                this.stats[timeBucket] = this.stats[timeBucket] + 1;
            }
        }
    }

    private printAndClearStats(): void {
        const seconds = Math.floor(this.env.TOKEN_EXPIRY/1000);
        log.info(`${this.windowCount} events processed in ${seconds} second window`);
        console.table(this.statsSummary);
        if (this.env.TIME_BUCKET !== undefined) {
            const  avg =  Math.round(Object.values(this.stats).reduce((prev: number, curr: number) => prev + curr) / Object.values(this.stats).length);
            this.stats['AVERAGE'] = avg;
            console.table(this.stats);
        }
        this.stats = {};
        this.statsSummary = {};
        this.windowCount = 0;
    }

    public async start(): Promise<void> {
        let client: Client = this.getClient();
        const delay = (ms: number) =>{
            return new Promise( resolve => setTimeout(resolve, ms) );
        };
        const initiate = async() => {
            log.debug('Initiating a new connection');
            client.dispose();
            this.activeSocket?.terminate();
            if (this.windowCount > 0) {
                this.printAndClearStats();
            }
            log.debug(`Connecting in ${this.env.TIMER} ms`);
            await delay(this.env.TIMER);
            client = this.getClient();
            try {
                await this.subscribe(client);
            } catch (error) {
                log.error(error);
            }
        };
        setImmediate(() => initiate());
        setInterval(() => {initiate();}, this.env.TOKEN_EXPIRY);
    }
}