import { Request, Response } from 'express';
import { 
  Keypair, 
  VersionedTransaction, 
  Connection, 
  PublicKey, 
  SystemProgram,
  TransactionMessage,
  LAMPORTS_PER_SOL,
  MessageAccountKeys
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { calculateAllFees, getCurrentFeeData } from '../utils/feeCalculator';

dotenv.config();

// Connect to Solana
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Create fee payer wallet
let feePayerWallet: Keypair;
let FEE_PAYER_ADDRESS: string;

// Fee collection wallet (could be the same as fee payer for simplicity)
let feeCollectionWallet: Keypair;
let FEE_COLLECTION_ADDRESS: string;

// Parse the service fee percentage from env (0.5% by default)
const SERVICE_FEE_PERCENTAGE = parseFloat(process.env.SERVICE_FEE_PERCENTAGE || '0.5');

// Estimated gas fee in lamports (average Solana transaction)
const ESTIMATED_GAS_FEE = 0.000005 * LAMPORTS_PER_SOL; // 5000 lamports

try {
  const FEE_PAYER_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
  
  if (!FEE_PAYER_PRIVATE_KEY || FEE_PAYER_PRIVATE_KEY === 'your_solana_private_key_here') {
    console.warn('No valid private key found in .env, generating a temporary one for development');
    feePayerWallet = Keypair.generate();
  } else {
    feePayerWallet = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_PRIVATE_KEY));
  }
  
  FEE_PAYER_ADDRESS = feePayerWallet.publicKey.toBase58();
  
  // For simplicity, use the same wallet for fee collection
  // In production, you might want a separate wallet
  feeCollectionWallet = feePayerWallet;
  FEE_COLLECTION_ADDRESS = feeCollectionWallet.publicKey.toBase58();
  
  console.log(`Fee payer address: ${FEE_PAYER_ADDRESS}`);
  console.log(`Fee collection address: ${FEE_COLLECTION_ADDRESS}`);
} catch (error) {
  console.error('Error initializing fee payer wallet:', error);
  feePayerWallet = Keypair.generate();
  feeCollectionWallet = feePayerWallet;
  FEE_PAYER_ADDRESS = feePayerWallet.publicKey.toBase58();
  FEE_COLLECTION_ADDRESS = feeCollectionWallet.publicKey.toBase58();
}

/**
 * Extract transfer amount from a System Program transfer instruction
 * @param data Instruction data buffer
 * @returns The amount in lamports
 */
function extractTransferAmount(data: Uint8Array): number {
  if (data.length >= 12 && data[0] === 2) { // Command 2 is transfer
    const view = new DataView(data.buffer, data.byteOffset + 4, 8);
    return Number(view.getBigUint64(0, true)); // Little endian
  }
  return 0;
}

/**
 * Calculate service fee based on transfer amount
 * @param transferAmount Amount in lamports
 * @returns Service fee in lamports
 */
function calculateServiceFee(transferAmount: number): number {
  // Minimum fee is 5000 lamports (0.000005 SOL)
  const calculatedFee = Math.ceil(transferAmount * (SERVICE_FEE_PERCENTAGE / 100));
  return Math.max(calculatedFee, 5000);
}

// Interface for a decoded instruction
interface DecodedInstruction {
  programId: PublicKey;
  keys: Array<{
    pubkey: PublicKey;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  data: Buffer;
}

/**
 * Step 1: Prepare transaction with fees
 * This endpoint calculates fees and prepares a transaction with the fee included
 * @param req Request containing the transaction intent
 * @param res Response
 */
export const prepareFeeTransaction = async (req: Request, res: Response) => {
  try {
    console.log('Received request to prepare transaction with fees');
    
    // Get the transaction intent from the request
    const { 
      recipientAddress, 
      amount, 
      senderAddress 
    } = req.body;

    if (!recipientAddress || !amount || !senderAddress) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        details: 'recipientAddress, amount, and senderAddress are required'
      });
    }

    // Parse input data
    const recipient = new PublicKey(recipientAddress);
    const sender = new PublicKey(senderAddress);
    const transferAmount = parseFloat(amount) * LAMPORTS_PER_SOL;
    
    // Calculate fees using dynamic fee calculator
    const feeInfo = await calculateAllFees(transferAmount);
    const totalFee = feeInfo.totalFeeRequired;
    
    console.log(`Calculated dynamic fees: Service Fee = ${feeInfo.serviceFeeAmount} lamports, Gas Reimbursement = ${feeInfo.gasFeeReimbursement} lamports`);
    
    // Get a fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Create both instructions: the user's transfer and the fee payment
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: recipient,
      lamports: transferAmount
    });
    
    const feeInstruction = SystemProgram.transfer({
      fromPubkey: sender,
      toPubkey: feeCollectionWallet.publicKey,
      lamports: totalFee
    });
    
    // Build a transaction with both instructions
    const messageV0 = new TransactionMessage({
      payerKey: feePayerWallet.publicKey,  // Backend pays the gas
      recentBlockhash: blockhash,
      instructions: [
        transferInstruction,
        feeInstruction
      ]
    }).compileToV0Message();
    
    // Create the transaction
    const transaction = new VersionedTransaction(messageV0);
    
    // Serialize the transaction for the frontend to sign
    const serializedTransaction = Buffer.from(transaction.serialize()).toString('base64');
    
    // Return the transaction with fee information
    return res.status(200).json({
        preparedTransaction: serializedTransaction,
        fees: {
          ...feeInfo,
          feeCollectionAddress: FEE_COLLECTION_ADDRESS
        },
        message: 'Transaction prepared with fees. Sign this transaction and submit to the sponsor-transaction endpoint.'
      });
    
  } catch (error: any) {
    console.error('Error preparing fee transaction:', error);
    
    return res.status(500).json({
      error: 'Failed to prepare transaction',
      details: error.message
    });
  }
};

/**
 * Step 2: Process signed transaction with fees
 * This endpoint processes a transaction that's been signed by the user and includes fees
 * @param req Request containing the signed transaction
 * @param res Response
 */
export const sponsorTransaction = async (req: Request, res: Response) => {
  try {
    console.log('Received transaction sponsorship request');
    
    // Get the user-signed transaction from the request
    const { transaction: serializedTransaction } = req.body;

    if (!serializedTransaction) {
      return res.status(400).json({ error: 'Missing transaction data' });
    }

    // Deserialize the transaction
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);

    // Extract message and account keys
    const message = transaction.message;
    const accountKeys = message.getAccountKeys();
    
    // Check fee payer
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

    // Initialize tracking variables
    let transferAmount = 0;
    let senderPublicKey: PublicKey | undefined;
    let recipientPublicKey: PublicKey | undefined;
    let feePaymentFound = false;
    let feePaymentAmount = 0;
    
    // Check each instruction for transfers and fee payment
    for (const instruction of message.compiledInstructions) {
      const programId = accountKeys.get(instruction.programIdIndex);
      
      if (!programId) {
        continue;
      }
      
      // Look for System Program transfers
      if (programId.toBase58() === '11111111111111111111111111111111') {
        // Check if it's a transfer (command 2)
        if (instruction.data[0] === 2) {
          const senderIndex = instruction.accountKeyIndexes[0];
          const recipientIndex = instruction.accountKeyIndexes[1];
          
          const sender = accountKeys.get(senderIndex);
          const recipient = accountKeys.get(recipientIndex);
          
          if (!sender || !recipient) continue;
          
          // Extract transfer amount
          const amount = extractTransferAmount(instruction.data);
          
          // Don't allow transfers from fee payer
          if (sender.toBase58() === FEE_PAYER_ADDRESS) {
            return res.status(403).json({
              error: 'Transaction attempts to transfer funds from fee payer'
            });
          }
          
          // Check if this is a fee payment (transfer to fee collection wallet)
          if (recipient.toBase58() === FEE_COLLECTION_ADDRESS) {
            feePaymentFound = true;
            feePaymentAmount = amount;
            console.log(`Found fee payment of ${amount} lamports to fee collection wallet`);
          } else {
            // This is the user's intended transfer
            transferAmount = amount;
            senderPublicKey = sender;
            recipientPublicKey = recipient;
            console.log(`Found user transfer of ${amount} lamports from ${sender.toBase58()} to ${recipient.toBase58()}`);
          }
        }
      }
    }
    
    // Verify sender has signed the transaction
    let senderIsSigner = false;
    if (senderPublicKey) {
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys.get(i);
        if (key && key.toBase58() === senderPublicKey.toBase58() && message.isAccountSigner(i)) {
          senderIsSigner = true;
          break;
        }
      }
    }
    
    if (!senderIsSigner) {
      return res.status(403).json({
        error: 'Transaction not signed by sender',
        details: 'The sender must sign the transaction'
      });
    }
    
    // Calculate expected fee using dynamic calculator
    const feeInfo = await calculateAllFees(transferAmount);
    const expectedServiceFee = feeInfo.serviceFeeAmount;
    const expectedGasFee = feeInfo.gasFeeReimbursement;
    const expectedTotalFee = feeInfo.totalFeeRequired;
    
    // Verify fee payment
    const minAcceptableFee = Math.floor(expectedTotalFee * 0.95); // Allow 5% margin for calculations
    
    if (!feePaymentFound) {
      return res.status(403).json({
        error: 'Missing fee payment',
        details: `Transaction must include a payment of at least ${expectedTotalFee} lamports to ${FEE_COLLECTION_ADDRESS}`
      });
    }
    
    if (feePaymentAmount < minAcceptableFee) {
      return res.status(403).json({
        error: 'Insufficient fee payment',
        details: `Fee payment of ${feePaymentAmount} lamports is less than required ${expectedTotalFee} lamports`
      });
    }
    
    // Transaction is valid, sign with fee payer
    console.log('Transaction is valid with proper fee payment. Signing with fee payer wallet.');
    transaction.sign([feePayerWallet]);
    
    // Send the transaction
    console.log('Sending transaction to Solana network');
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 5
    });
    
    console.log('Transaction sent successfully with signature:', signature);
    
    // Return the transaction hash and fee details
    return res.status(200).json({
      transactionHash: signature,
      message: 'Transaction sponsored successfully with fee payment',
      fees: {
        originalTransferAmount: transferAmount,
        serviceFeePercentage: SERVICE_FEE_PERCENTAGE,
        serviceFeeAmount: expectedServiceFee,
        gasFeeReimbursement: expectedGasFee,
        totalFeePaid: feePaymentAmount,
        feeCollectionAddress: FEE_COLLECTION_ADDRESS
      }
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

/**
 * Get current fee rates
 * This endpoint provides current fee information without preparing a transaction
 * @param req Request
 * @param res Response
 */
export const getCurrentFeeRates = async (req: Request, res: Response) => {
    try {
      const feeData = await getCurrentFeeData();
      
      // Return the fee data
      return res.status(200).json({
        currentFeeData: {
          gasFeeLamports: feeData.gasFeeLamports,
          serviceFeePercentage: feeData.serviceFeePercentage,
          solPriceUsd: feeData.solPriceUsd,
          lastUpdated: new Date().toISOString()
        },
        message: 'Current fee rates retrieved successfully'
      });
      
    } catch (error: any) {
      console.error('Error getting current fee rates:', error);
      
      return res.status(500).json({
        error: 'Failed to get fee rates',
        details: error.message
      });
    }
  };