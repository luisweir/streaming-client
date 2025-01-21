// Call.ts
import { log } from './logger.js';
import axios, { AxiosError } from 'axios';

export class Call {

    // HTTP invoker
    public async call(url: string, options: any): Promise<any> {
        try {
            const response = await axios({
                url,
                ...options
            });
            return response.data;
        } catch (err) {
            const error = {
                'httpStatusCode': (err as AxiosError).response?.status,
                'msg': (err as AxiosError).response?.statusText,
                'reason': (err as AxiosError).response?.data
            };
            // log.trace(err);
            throw error;
        }
    }

    public async fetchToken(url: string, options: any) {
        try {
            log.debug(`Obtaining access token from ${url}`);
            const token = await this.call(url, options);
            log.debug('Successfully fetched access token');
            return token;
        } catch (error) {
            log.error(error);
        }
    }
}