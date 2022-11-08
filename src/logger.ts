import dotenv from 'dotenv';
import { Logger, ISettingsParam, TLogLevelName } from 'tslog';
dotenv.config({path: process.env.ENVPATH || './.env'});

const logLevel: TLogLevelName = process.env.LOGLEVEL as TLogLevelName || 'silly';
const config: ISettingsParam = {
    type: 'pretty',
    minLevel: logLevel
};
export const log: Logger = new Logger(config);
log.info(`logLevel=${logLevel}`);