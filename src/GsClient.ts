import { log } from './logger.js';
import WebSocket from 'ws';
import { Client, createClient as createWSClient, SubscribePayload } from 'graphql-ws';
import { Call } from './Call.js';
import { simplifyEvent } from './minimizer.js';
import { v4 as uuidv4 } from 'uuid';
import {openSync, writeSync} from "node:fs";
import {CompressionTypes, Kafka, KafkaConfig} from 'kafkajs';

enum bucketTypes {
    HOUR = 'HOUR',
    MINUTE = 'MINUTE',
    SECOND = 'SECOND'
}

interface IStrIndex {
    [index: string]: number;
}

export interface Environment {
    APIGW_URL: string;
    WS_URL: string;
    OAUTH_TYPE: string;
    OAUTH_ENDPOINT: string;
    OAUTH_SCOPE: string;
    SUBS_ENDPOINT: string;
    APP_KEY: string;
    INTEGRATION_USER: string;
    INTEGRATION_PASSWORD: string;
    CLIENT_ID: string;
    CLIENT_SECRET: string;
    ENTERPRISE_ID: string;
    TOKEN_EXPIRY: number;
    DELAY_BEFORE_RECONNECT: number;
    RUN_FOR: number;
    PING: number;
    PING_TIMEOUT: number;
    TIMER: number;
    CHAIN: string | undefined;
    HOTELID: string | undefined;
    OFFSET: number | undefined;
    DELTA: boolean;
    STATS: boolean;
    TIME_BUCKET: string | undefined;
    GRAPHQL_CLIENT_ID: string | undefined;
    DUMP_TO_FILE: boolean;
    SEGMENT_CONVERSION: boolean;
    STACK_VALUES: boolean;
    KAFKA_ENABLED: boolean;
    KAFKA_HOST: string | undefined;
    KAFKA_USER: string | undefined;
    KAFKA_PASSWORD: string | undefined;
    KAFKA_TOPIC: string | undefined;
    KAFKA_CLIENT_ID: string | undefined;
}

export const errorCodeMappings: { [id: string] : string; } = {
    '1000': 'Normal Closure',
    '1001': 'Going Away',
    '1002': 'Protocol Error',
    '1003': 'Unsupported Data',
    '1004': '(For future)',
    '1005': 'No Status Received',
    '1006': 'Abnormal Closure (Refresh ?)',
    '1007': 'Invalid frame payload data',
    '1008': 'Policy Violation',
    '1009': 'Message too big',
    '1010': 'Missing Extension',
    '1011': 'Internal Error',
    '1012': 'Service Restart',
    '1013': 'Try Again Later',
    '1014': 'Bad Gateway',
    '1015': 'TLS Handshake',
    '4409': 'Too many requests',
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface OAuthOptions {
    // Define the properties here based on your application's requirements
}

export class GsClient {

    private offset: number | undefined;
    private env: Environment;
    private wsUrl: string;
    private oauthUrl: string;
    private oauthOptions: OAuthOptions;
    private call: Call;
    private activeSocket: WebSocket | null = null;
    private windowCount: number;
    private statsSummary: IStrIndex;
    private stats: IStrIndex;
    private json_file: any;
    private client: Client | undefined;
    private client_id: any = undefined;
    private kafka: Kafka | undefined;
    private kafkaProducer: any | undefined;

    public constructor(env: Environment, wsUrl: string, oauthUrl: string, oauthOptions: OAuthOptions, call: Call) {
        this.offset = env.OFFSET;
        this.env = env;
        this.wsUrl = wsUrl;
        this.oauthUrl = oauthUrl;
        this.oauthOptions = oauthOptions;
        this.call = call;
        this.windowCount = 0;
        this.statsSummary = {};
        this.stats = {};
        this.kafka = undefined;

        if (this.env.DUMP_TO_FILE)
            this.json_file = openSync('./events.json','w');

        if (this.env.KAFKA_ENABLED && this.env.KAFKA_HOST) {
            let kafkaConfig: KafkaConfig = {
                brokers: this.env.KAFKA_HOST.split(','),
                clientId: 'ohip-shovel'
            };
            if (this.env.KAFKA_USER !== undefined && this.env.KAFKA_PASSWORD !== undefined) {
                kafkaConfig['sasl'] = {
                    mechanism: 'plain',
                        username: this.env.KAFKA_USER,
                        password: this.env.KAFKA_PASSWORD,
                }
            }
            this.kafka = new Kafka(kafkaConfig)
            this.kafkaProducer = this.getProducer(this.kafka);
        }
        this.registerShutdownHook(); // make sure to dispose and terminate the client on shutdown
    }

    public getProducer(kafka: Kafka): any {
        let kafkaProducer = kafka.producer({
            allowAutoTopicCreation: true,
            transactionTimeout: 30000,
            maxInFlightRequests: 1
        })
        kafkaProducer.connect()
        return kafkaProducer
    }

    public registerShutdownHook(): void {
        process.on('SIGINT', () => {
            log.info('Received SIGINT signal');
            this.terminateClient('SIGINT');
            setTimeout(process.exit(0), 2000);
        });
        process.on('SIGTERM', () => {
            log.info('Received SIGTERM signal');
            this.terminateClient('SIGTERM');
            setTimeout(process.exit(0), 2000);
        });
    }

    public terminateClient(reason: string): void {
        log.info(`Terminating client: ${reason}`)
        if (this.kafkaProducer !== undefined) {
            this.kafkaProducer.disconnect();
        }
        if (this.offset !== undefined) {
            log.info(`Last offset processed: ${this.offset}`);
            writeSync(openSync('./offset.txt','w'),this.offset.toString());
        }
        this.activeSocket?.send(`{"id":"${this.client_id}", "type":"complete"}`, (error) => {if (error) log.error(error);});
        if (this.client !== undefined) {
            this.disposeAndTerminate(this.client);
            this.printAndClearStatsIfAny();
        }
    }

    public getClient(): Client {
        log.debug('Creating client');
        this.client_id = (this.env.GRAPHQL_CLIENT_ID !== undefined) ? this.env.GRAPHQL_CLIENT_ID : (this.client_id !== undefined) ? this.client_id : uuidv4();
        log.debug(`Using client id: ${this.client_id}`);
        let timedOut: any;
        return createWSClient({
            webSocketImpl: WebSocket,
            url: this.wsUrl,
            generateID: () => {
                return this.client_id;
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
                    'x-app-key': `${this.env.APP_KEY}`,
                    'enterpriseId': `${this.env.ENTERPRISE_ID}`
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
                    log.info(`Socket closed with event ${event.code} (${errorCodeMappings[event.code]}) :: ${event.reason}`);
                },
                ping: (received) => {
                    if (!received) // sent
                        log.silly('Ping sent');
                        timedOut = setTimeout(() => {
                            if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
                                log.error('Ping timeout, refreshing connection');
                                this.startConsuming(true);
                            }
                        }, this.env.PING / 2); // if pong not received within this timeframe then recreate connection
                },
                pong: (received) => {
                    if (received) {
                        log.silly('Pong received');
                        clearTimeout(timedOut);
                    } // pong is received, clear connection close timeout
                },
                error: (error) => {
                    log.error(error);
                }
            }
        });
    }

    public createQuery(chainCode: string | undefined, offset?: number | undefined, hotelCode?: string | undefined, delta?: boolean): any {
        log.debug(`Creating query for chainCode: ${chainCode}, offset: ${(offset !== undefined) ? offset : 'latest'}, hotelCode: ${hotelCode}, delta: ${delta}`)
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
                        let event = result.data
                        if (this.env.SEGMENT_CONVERSION) {
                            try {
                                event = simplifyEvent(result.data, this.env)
                            } catch (error) {
                                log.error(error);
                            }
                        }
                        log.silly(JSON.stringify(event));
                        if (this.kafkaProducer !== undefined) {
                            this.kafkaProducer.send({
                                topic: this.env.KAFKA_TOPIC,
                                acks: 1,
                                compression: CompressionTypes.GZIP,
                                messages: [{
                                    key: result.data.newEvent.metadata.uniqueEventId,
                                    value: JSON.stringify(event)
                                }]
                            });
                        }
                        if (this.env.DUMP_TO_FILE && this.json_file !== undefined)
                            writeSync(this.json_file, JSON.stringify(event));
                    },
                    error: (error) => {
                        reject(error);
                    },
                    complete: () => {
                        log.silly('Connection Completed');
                        resolve(result)
                    }
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
            this.stats['AVERAGE'] = Math.round(Object.values(this.stats).reduce((prev: number, curr: number) => prev + curr) / Object.values(this.stats).length);
            console.table(this.stats);
        }
        this.stats = {};
        this.statsSummary = {};
        this.windowCount = 0;
    }

    public async startConsuming (reconnect: boolean = false, reason: string = '') {
        this.terminateClient(`Refreshing connection with new token`);
        if (reconnect) {
            log.debug(`Refreshing an existing connection in ${this.env.TIMER}ms (${reason})`);
            await this.delay(this.env.TIMER);
        } else {
            log.debug('Initiating a new connection');
        }
        this.client = this.getClient();
        if (this.kafka)
            this.kafkaProducer = this.getProducer(this.kafka);
        try {
            await this.subscribe(this.client);
        } catch (error) {
            log.error(error);
            log.debug(`Retrying in ${this.env.DELAY_BEFORE_RECONNECT} milliseconds`);
            setTimeout(() => this.startConsuming(true), this.env.DELAY_BEFORE_RECONNECT);
        }
    }

    public async stopConsuming (reconnect: boolean = false) {
        try {
            if (!reconnect) this.terminateClient('Application stopped by user');
            process.exit(0);
        } catch (error) {
            log.error(error);
        }
    }

    public async start(): Promise<void> {
        this.client = undefined;
        setImmediate(() => this.startConsuming(false));
        setInterval(() => {this.startConsuming(true);}, this.env.TOKEN_EXPIRY);
        if (this.env.RUN_FOR > 0) {
            setInterval(() => {this.stopConsuming(false);}, this.env.RUN_FOR);
        }
    }

    private async disposeAndTerminate(client: Client) {
        await client.dispose();
        this.activeSocket?.terminate();
    }

    private printAndClearStatsIfAny() {
        if (this.windowCount > 0) {
            this.printAndClearStats();
        }
    }

    private delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}
