import dotenv from 'dotenv';
import { log } from './logger.js';
import { Call } from './Call.js';
import { Hasher } from './Hasher.js';
import { GsClient, Environment } from './GsClient.js';
import {readFileSync, existsSync} from "node:fs";

dotenv.config({path: process.env.ENVPATH || './.env'});

const env: Environment = {
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
    DELAY_BEFORE_RECONNECT: Number(process.env.DELAY_BEFORE_RECONNECT) || 5000,
    RUN_FOR: Number(process.env.RUN_FOR) || 7080000,
    PING: Number(process.env.PING) || 5000,
    PING_TIMEOUT: Number(process.env.PING_TIMEOUT) || 4408,
    TIMER: Number(process.env.TIMER) || 10000,
    CHAIN: process.env.CHAIN,
    HOTELID: process.env.HOTELID,
    OFFSET: existsSync('offset.txt') ? Number(readFileSync('./offset.txt')) : (process.env.OFFSET ? Number(process.env.OFFSET) : undefined),
    DELTA: process.env.DELTA==='true',
    STATS: process.env.STATS==='true',
    TIME_BUCKET: process.env.TIME_BUCKET || undefined,
    GRAPHQL_CLIENT_ID: process.env.GRAPHQL_CLIENT_ID || undefined,
    DUMP_TO_FILE: process.env.DUMP_TO_FILE==='true',
    SEGMENT_CONVERSION: process.env.SEGMENT_CONVERSION==='true',
    STACK_VALUES: process.env.STACK_VALUES==='true',
    KAFKA_ENABLED: process.env.KAFKA_ENABLED==='false',
    KAFKA_HOST: process.env.KAFKA_HOST,
    KAFKA_USER: process.env.KAFKA_USER,
    KAFKA_PASSWORD: process.env.KAFKA_PASSWORD,
    KAFKA_TOPIC: process.env.KAFKA_TOPIC || 'ohip-events',
    KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'gs-client',
};

// required to fetch OAuth Token
const call: Call = new Call();
const method = 'POST';
const oauthUrl = env.APIGW_URL + env.OAUTH_ENDPOINT;
const authZ = Buffer.from(env.CLIENT_ID + ':' + env.CLIENT_SECRET).toString('base64');
const oauthOptions = {
    method,
    headers: {
        'x-app-key': env.APP_KEY,
        Authorization: 'Basic ' + authZ
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
const client: GsClient = new GsClient(env, wsUrl, oauthUrl, oauthOptions, call);

// Start the connection
try {
    // await client.execute(env);
    client.start();
} catch {
    log.fatal('Error establishing socket connection');
}
