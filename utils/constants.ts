import {Logger} from 'pino';
import {logger} from './logger';

require('dotenv').config();

const retrieveEnvVariable = (variableName: string, logger: Logger) => {
  const variable = process.env[variableName] || undefined;
  if (!variable) {
    logger.error(`${variableName} is not set`);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
  return variable;
};


// Wallets
export const SOLANA_ADMIN_PRIVATE_KEY = retrieveEnvVariable('SOLANA_ADMIN_PRIVATE_KEY', logger);
export const ETHEREUM_ADMIN_PRIVATE_KEY = retrieveEnvVariable('ETHEREUM_ADMIN_PRIVATE_KEY', logger);

// Connections
export const SOLANA_RPC_ENDPOINT = retrieveEnvVariable('SOLANA_RPC_ENDPOINT', logger);
export const ETHEREUM_RPC_ENDPOINT = retrieveEnvVariable('ETHEREUM_RPC_ENDPOINT', logger);

// Contracts
export const ETH_VOIP_TOKEN_ADDRESS = retrieveEnvVariable('ETH_VOIP_TOKEN_ADDRESS', logger);
export const ETH_BRIDGE_CONTRACT_ADDRESS = retrieveEnvVariable('ETH_BRIDGE_CONTRACT_ADDRESS', logger);
export const SOL_VOIP_TOKEN_PROGRAM_ID = retrieveEnvVariable('SOL_VOIP_TOKEN_PROGRAM_ID', logger);
export const SOL_VOIP_TOKEN_MINT = retrieveEnvVariable('SOL_VOIP_TOKEN_MINT', logger);
export const SOL_MIGRATION_PROGRAM_ID = retrieveEnvVariable('SOL_MIGRATION_PROGRAM_ID', logger);

// Filters
export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL', logger);
