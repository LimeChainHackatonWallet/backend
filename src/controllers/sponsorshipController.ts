import { Request, Response } from 'express';
import { Keypair, VersionedTransaction, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// Connect to Solana
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Create fee payer wallet - only if valid private key exists in env
let feePayerWallet: Keypair;
let FEE_PAYER_ADDRESS: string;

try {
  const FEE_PAYER_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
  
  if (!FEE_PAYER_PRIVATE_KEY || FEE_PAYER_PRIVATE_KEY === 'your_solana_private_key_here') {
    // For development, create a new keypair if none provided
    console.warn('No valid private key found in .env, generating a temporary one for development');
    feePayerWallet = Keypair.generate();
  } else {
    feePayerWallet = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_PRIVATE_KEY));
  }
  
  FEE_PAYER_ADDRESS = feePayerWallet.publicKey.toBase58();
  console.log(`Fee payer address: ${FEE_PAYER_ADDRESS}`);
} catch (error) {
  console.error('Error initializing fee payer wallet:', error);
  // Create a temporary keypair for development
  feePayerWallet = Keypair.generate();
  FEE_PAYER_ADDRESS = feePayerWallet.publicKey.toBase58();
}

/**
 * Sponsor a transaction by signing it with the fee payer wallet
 * @param req Request containing the serialized transaction
 * @param res Response
 */
export const sponsorTransaction = async (req: Request, res: Response) => {
  try {
    console.log('Received transaction sponsorship request');
    
    // Get the partially signed transaction from the request
    const { transaction: serializedTransaction } = req.body;

    if (!serializedTransaction) {
      return res.status(400).json({ error: 'Missing transaction data' });
    }

    // Deserialize the transaction
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    // Verify the transaction
    // 1. Check that it's using the correct fee payer
    const message = transaction.message;
    const accountKeys = message.getAccountKeys();
    const feePayerIndex = 0; // Fee payer is always the first account
    const feePayer = accountKeys.get(feePayerIndex);

    if (!feePayer || feePayer.toBase58() !== FEE_PAYER_ADDRESS) {
      return res.status(403).json({
        error: 'Invalid fee payer in transaction',
        details: {
          expected: FEE_PAYER_ADDRESS,
          received: feePayer?.toBase58() || 'none'
        }
      });
    }

    // 2. Check for any unauthorized fund transfers
    for (const instruction of message.compiledInstructions) {
      // Fixed: using programIdIndex instead of programIndex
      const programId = accountKeys.get(instruction.programIdIndex);

      // Check if instruction is for System Program (transfers)
      if (programId && programId.toBase58() === '11111111111111111111111111111111') {
        // Check if it's a transfer (command 2)
        if (instruction.data[0] === 2) {
          const senderIndex = instruction.accountKeyIndexes[0];
          const senderAddress = accountKeys.get(senderIndex);

          // Don't allow transactions that transfer tokens from fee payer
          if (senderAddress && senderAddress.toBase58() === FEE_PAYER_ADDRESS) {
            return res.status(403).json({
              error: 'Transaction attempts to transfer funds from fee payer'
            });
          }
        }
      }
    }

    // 3. Sign with fee payer
    console.log('Signing transaction with fee payer wallet');
    transaction.sign([feePayerWallet]);

    // 4. Send transaction with better options
    console.log('Sending transaction to Solana network');
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 5
    });

    console.log('Transaction sent successfully with signature:', signature);

    // Return the transaction hash
    return res.status(200).json({
      transactionHash: signature,
      message: 'Transaction sent successfully'
    });
  } catch (error: any) {
    console.error('Error processing transaction:', error);
    
    // Enhanced error reporting
    let errorMessage = error.message;
    if (error.logs) {
      errorMessage += "\nLogs: " + error.logs.join("\n");
    }
    
    return res.status(500).json({
      error: 'Failed to process transaction',
      details: errorMessage
    });
  }
};