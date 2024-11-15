import { ethers, Wallet } from "ethers";
import { BN } from "bn.js";
import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, Idl, Program } from "@project-serum/anchor";
import { Connection, Keypair, PublicKey, Signer, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ETH_BRIDGE_CONTRACT_ADDRESS, ETH_VOIP_TOKEN_ADDRESS, ETHEREUM_ADMIN_PRIVATE_KEY, ETHEREUM_RPC_ENDPOINT, getWallet, LOG_LEVEL, logger, SOL_MIGRATION_PROGRAM_ID, SOL_VOIP_TOKEN_MINT, SOL_VOIP_TOKEN_PROGRAM_ID, SOLANA_ADMIN_PRIVATE_KEY, SOLANA_RPC_ENDPOINT } from "./utils";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";

const bridgeAbi = require("./artifacts/eth/bridge/bridge.json");

const ethProvider = new ethers.WebSocketProvider(ETHEREUM_RPC_ENDPOINT);
const adminEthWallet = new ethers.Wallet(ETHEREUM_ADMIN_PRIVATE_KEY);
const ethAccount = adminEthWallet.connect(ethProvider);

const COMMITMENT_LEVEL = "finalized";
const solConnection = new Connection(SOLANA_RPC_ENDPOINT, {
  commitment: COMMITMENT_LEVEL,
});
const adminSolWallet = getWallet(SOLANA_ADMIN_PRIVATE_KEY.trim());
let solWallet = new NodeWallet(adminSolWallet);
const solProvider = new AnchorProvider(solConnection, solWallet, {
  commitment: COMMITMENT_LEVEL,
});

const decimals: number =  10 ** 9;

const relayerConfig = {
  solWallet: adminSolWallet, 
  ethWallet: adminEthWallet,
  solTokenProgramId: SOL_VOIP_TOKEN_PROGRAM_ID,
  solVoipTokenMint: SOL_VOIP_TOKEN_MINT, 
  solMigrationProgramId: SOL_MIGRATION_PROGRAM_ID, 
  ethTokenAddress: ETH_VOIP_TOKEN_ADDRESS, 
  ethBridgeAddress: ETH_BRIDGE_CONTRACT_ADDRESS
}

function printDetails(solWallet: Keypair, ethWallet: Wallet) {
  logger.info(`                                 
                  VVVVVVVV           VVVVVVVV
                  V::::::V           V::::::V
                  V::::::V           V::::::V
                  V::::::V           V::::::V
                   V:::::V           V:::::V 
                    V:::::V         V:::::V  
                     V:::::V       V:::::V   
                      V:::::V     V:::::V    
                       V:::::V   V:::::V     
                        V:::::V V:::::V      
                         V:::::V:::::V       
                          V:::::::::V        
                           V:::::::V         
                            V:::::V          
                             V:::V           
                              VVV                                          
                  
                VOIP FINANCE RELAYER ACTIVATED 🚀🐟
                      Made with ❤️ by Kombi.                                          
  `);

  logger.info('------- CONFIGURATION START -------');
  logger.info(`SOL Admin Wallet: ${solWallet.publicKey.toString()}`);
  logger.info(`ETH Admin Wallet: ${ethWallet.address.toString()}`);

  logger.info('');
  logger.info(`SOL Migration Contract: ${relayerConfig.solMigrationProgramId.toString()}`);
  logger.info(`ETH Bridge Contract: ${relayerConfig.ethBridgeAddress.toString()}`);
  logger.info(`SOL Token Mint: ${relayerConfig.solVoipTokenMint.toString()}`);
  logger.info(`SOL Token Program ID: ${relayerConfig.solTokenProgramId.toString()}`);
  logger.info(`ETH Token Address: ${relayerConfig.ethTokenAddress.toString()}`);

  logger.info('');
  logger.info(`Log level: ${LOG_LEVEL}`);
  logger.info("------ CONFIGURATION COMPLETE -------")
  logger.info('Relayer is starting...');
}

logger.level = LOG_LEVEL;
printDetails(adminSolWallet, adminEthWallet);

const ethBridge = new ethers.Contract(
  relayerConfig.ethBridgeAddress,
  bridgeAbi,
  ethAccount
);


ethBridge.on("TokensLocked", async (amount, user, solanaAddress, _timestamp, _event) => {
  logger.info(
    `
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            Processing new migration
      ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            ETH Address: ${user}
            SOL Address: ${solanaAddress}
            Amount:      ${amount}
    `
  )
  let mintTxHash, migrateTxHash;

  // mint new tokens on sol
  try {
    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              Minting new SOL VOIP Tokens
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address: ${user}
              SOL Address: ${solanaAddress}
              Amount:      ${amount}
      `
    )
    mintTxHash = await mintToken(amount, new PublicKey(solanaAddress));

    // migrate token to user sol account
    try {
      logger.info(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                Migrating SOL VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
        `
      )
      migrateTxHash = await migrateToken(amount, new PublicKey(solanaAddress));
    } catch (error) {
      logger.error(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
             Failed to Migrate VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
                Status:      Failed❌
                Error:       ${error}
        `
      )
    }
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           Failed to Mint SOL VOIP Tokens
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address: ${user}
              SOL Address: ${solanaAddress}
              Amount:      ${amount}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }
  
  if (mintTxHash === undefined || mintTxHash === null || migrateTxHash === undefined || migrateTxHash === null) {
    // unlock token
    try {
      logger.info(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              Refunding user ETH VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
        `
      )
      await unlockToken(user);
    } catch (error) {
      logger.error(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
             Failed to Unlock ETH VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
                Status:      Failed❌
                Error:       ${error}
        `
      )
    }

    // burn refunded token on solana
    try {
      logger.info(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              Burning excess SOL VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
        `
      )
      burnSolToken(amount);
    } catch (error) {
      logger.error(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          Failed to Burn Excess SOL VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
                Status:      Failed❌
                Error:       ${error}
        `
      )
    }
  } else {
    // burn token on eth
    try {
      logger.info(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                Burning ETH VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
        `
      )
      await burnEthToken(user);
    } catch (error) {
      logger.error(
        `
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              Failed to Burn ETH VOIP Tokens
          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                ETH Address: ${user}
                SOL Address: ${solanaAddress}
                Amount:      ${amount}
                Status:      Failed❌
                Error:       ${error}
        `
      )
    }
  }
})

const mintToken = async(amount: number, destination: PublicKey) => {
  const voipTokenIDL = require("./artifacts/sol/token/voip-token.json") as Idl;

  const voipTokenProgram = new Program(voipTokenIDL, new PublicKey(relayerConfig.solTokenProgramId), solProvider);
  const adminAta = await getOrCreateAssociatedTokenAccount(solConnection, adminSolWallet, new PublicKey(relayerConfig.solVoipTokenMint), adminSolWallet.publicKey, true)

  const adminSig: Signer = {
    publicKey: adminSolWallet.publicKey,
    secretKey: adminSolWallet.secretKey
  }

  const mintContext = {
    mint: new PublicKey(relayerConfig.solVoipTokenMint),
    destination: adminAta.address,
    payer: adminSolWallet.publicKey,
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  };
  
  let mintTxHash;
  try {
    mintTxHash = await voipTokenProgram.methods
    .mintTokens(new BN(parseInt(amount.toString()) * parseInt(decimals.toString())))
    .accounts(mintContext)
    .signers([adminSig])
    .rpc();

    await voipTokenProgram.provider.connection.confirmTransaction(mintTxHash, "finalized");
    
    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          Successfully minted SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address:  ${destination}
              Tx Hash:      ${mintTxHash}
              TX Status:    Success✅
      `
    )
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            Failed to mint SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address: ${destination}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }

  return mintTxHash;
}

const migrateToken = async(amount: number, destination: PublicKey) => {
  const voipMigrationIDL = require("./artifacts/sol/migration/voip-migration.json") as Idl;
  const voipMigrationProgram = new Program(voipMigrationIDL, new PublicKey(relayerConfig.solMigrationProgramId), solProvider);

  const destinationAta = await getOrCreateAssociatedTokenAccount(solConnection, adminSolWallet, new PublicKey(relayerConfig.solVoipTokenMint), destination)
  const adminAta = await getOrCreateAssociatedTokenAccount(solConnection, adminSolWallet, new PublicKey(relayerConfig.solVoipTokenMint), adminSolWallet.publicKey)

  const adminSig: Signer = {
    publicKey: adminSolWallet.publicKey,
    secretKey: adminSolWallet.secretKey
  }

  const STATE_SEED = "state";
  const MIGRATION_SEED = "migration";

  const [state] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(STATE_SEED),
    ],
    
    voipMigrationProgram.programId
  );

  const [migrationPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(MIGRATION_SEED),
      destination.toBuffer()
    ],
    voipMigrationProgram.programId
  )

  const migrateContext = {
    migration: migrationPDA,
    state: state,
    destinationAta: destinationAta.address,
    adminAta: adminAta.address,
    admin: adminSolWallet.publicKey,
    destination: destination,
    mint: new PublicKey(relayerConfig.solVoipTokenMint),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID
  };

  let migrateTxHash;
  try {
    migrateTxHash = await voipMigrationProgram.methods
      .migrate(new BN(parseInt(amount.toString()) * parseInt(decimals.toString())))
      .accounts(migrateContext)
      .signers([adminSig])
      .rpc();

    await voipMigrationProgram.provider.connection.confirmTransaction(migrateTxHash, "finalized");
    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        Successfully migrated SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address:  ${destination}
              Tx Hash:      ${migrateTxHash}
              TX Status:    Success✅
      `
    )
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          Failed to migrate SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address: ${destination}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }
  
  return migrateTxHash;
}


const burnEthToken = async(ethAddress: string) => {
  let burnTxHash;
  try {
    let tx = await ethBridge.burnTokens(ethAddress) 
    tx.wait();
    burnTxHash = tx.hash;

    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          Successfully burnt ETH VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address:  ${ethAddress}
              Tx Hash:      ${burnTxHash}
              TX Status:    Success✅
      `
    )
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           Failed to Burn ETH VOIP Tokens
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address: ${ethAddress}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }

  return burnTxHash;
}

const unlockToken = async(ethAddress: string) => {
  let unlockTxHash;
  try {
    let tx = await ethBridge.unlockTokens(ethAddress) 
    tx.wait();

    unlockTxHash = tx.hash;
    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        Successfully refunded ETH VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address:  ${ethAddress}
              Tx Hash:      ${unlockTxHash}
              TX Status:    Success✅
      `
    )
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           Failed to Unlock ETH VOIP Tokens
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              ETH Address: ${ethAddress}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }

  return unlockTxHash;
}

const burnSolToken = async(amount: number) => {
  const voipTokenIDL = require("./artifacts/sol/token/voip-token.json") as Idl;
  const voipTokenProgram = new Program(voipTokenIDL, new PublicKey(relayerConfig.solTokenProgramId), solProvider);

  const adminAta = await getOrCreateAssociatedTokenAccount(solConnection, adminSolWallet, new PublicKey(relayerConfig.solVoipTokenMint), adminSolWallet.publicKey, true)

  const burnContext = {
    mint: new PublicKey(relayerConfig.solVoipTokenMint),
    from: adminAta.address,
    payer: adminSolWallet.publicKey,
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  };

  const adminSig: Signer = {
    publicKey: adminSolWallet.publicKey,
    secretKey: adminSolWallet.secretKey
  }

  let burnTxHash;
  try {
    burnTxHash = await voipTokenProgram.methods
      .burnTokens(new BN(parseInt(amount.toString()) * parseInt(decimals.toString())))
      .accounts(burnContext)
      .signers([adminSig])
      .rpc();

    logger.info(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        Successfully burned excess SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address:  ${adminSolWallet.publicKey}
              Tx Hash:      ${burnTxHash}
              TX Status:    Success✅
      `
    )
  } catch (error) {
    logger.error(
      `
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
          Failed to Burned excess SOL VOIP Token
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
              SOL Address: ${adminSolWallet.publicKey}
              Status:      Failed❌
              Error:       ${error}
      `
    )
  }
  return burnTxHash;
}
