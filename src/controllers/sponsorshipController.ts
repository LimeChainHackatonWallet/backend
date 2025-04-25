import { Request, Response } from 'express';
import { 
  Keypair, 
  VersionedTransaction, 
  Connection, 
  PublicKey, 
  SystemProgram,
  TransactionMessage,
  LAMPORTS_PER_SOL,
  MessageAccountKeys,
  TransactionSignature
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

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
 * Sponsor a transaction and modify it to include fee collection
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
    const originalTransaction = VersionedTransaction.deserialize(transactionBuffer);

    // Extract message and account keys
    const originalMessage = originalTransaction.message;
    const accountKeys = originalMessage.getAccountKeys();
    
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

    // Extract information about the transfer
    let transferAmount = 0;
    let senderPublicKey: PublicKey | undefined;
    let recipientPublicKey: PublicKey | undefined;
    let foundTransfer = false;
    
    // Get all original instructions
    const originalInstructions: DecodedInstruction[] = [];
    
    for (const instruction of originalMessage.compiledInstructions) {
      const programId = accountKeys.get(instruction.programIdIndex);
      
      if (!programId) {
        console.error('Invalid program ID in instruction');
        continue;
      }
      
      // Decode instruction
      const instructionAccounts = instruction.accountKeyIndexes.map(
        index => accountKeys.get(index)
      ).filter((pubkey): pubkey is PublicKey => pubkey !== undefined);
      
      const instructionData = instruction.data;
      
      // Recreate the instruction object
      const decodedInstruction: DecodedInstruction = {
        programId: programId,
        keys: instructionAccounts.map((pubkey, i) => ({
          pubkey,
          isSigner: originalMessage.isAccountSigner(instruction.accountKeyIndexes[i]),
          isWritable: originalMessage.isAccountWritable(instruction.accountKeyIndexes[i])
        })),
        data: Buffer.from(instructionData)
      };
      
      originalInstructions.push(decodedInstruction);
      
      // Check if it's a System Program transfer
      if (programId.toBase58() === '11111111111111111111111111111111') {
        // Check if it's a transfer (command 2)
        if (instruction.data[0] === 2) {
          foundTransfer = true;
          const senderIndex = instruction.accountKeyIndexes[0];
          const recipientIndex = instruction.accountKeyIndexes[1];
          
          senderPublicKey = accountKeys.get(senderIndex);
          recipientPublicKey = accountKeys.get(recipientIndex);
          
          // Don't allow transactions that transfer tokens from fee payer
          if (senderPublicKey && senderPublicKey.toBase58() === FEE_PAYER_ADDRESS) {
            return res.status(403).json({
              error: 'Transaction attempts to transfer funds from fee payer'
            });
          }
          
          // Extract transfer amount
          transferAmount = extractTransferAmount(instruction.data);
          
          if (transferAmount > 0 && senderPublicKey && recipientPublicKey) {
            console.log(`Detected transfer of ${transferAmount} lamports from ${senderPublicKey.toBase58()} to ${recipientPublicKey.toBase58()}`);
          }
        }
      }
    }
    
    // If no transfer found, we can still proceed but with minimal fees
    if (!foundTransfer) {
      console.log('No transfer instruction found. Proceeding with minimal fees.');
    }
    
    // Calculate fees
    const serviceFee = calculateServiceFee(transferAmount);
    const gasFeeReimbursement = ESTIMATED_GAS_FEE;
    const totalFee = serviceFee + gasFeeReimbursement;
    
    console.log(`Calculated fees: Service Fee = ${serviceFee} lamports, Gas Reimbursement = ${gasFeeReimbursement} lamports`);
    
    // Check if sender is a signer by examining the signers in the message
    let senderIsSigner = false;
    
    if (senderPublicKey) {
      // A much simpler approach: check if the message indicates the sender is a signer
      const signerAddresses = [];
      
      // Simply check if the sender is marked as a signer in the message
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys.get(i);
        if (key && originalMessage.isAccountSigner(i)) {
          signerAddresses.push(key.toBase58());
        }
      }
      
      senderIsSigner = signerAddresses.includes(senderPublicKey.toBase58());
      console.log(`Sender ${senderPublicKey.toBase58()} is ${senderIsSigner ? 'a signer' : 'not a signer'}`);
    }
    
    // Check if we can collect fees (need sender to be a signer)
    if (senderPublicKey && senderIsSigner && totalFee > 0) {
      console.log('Creating modified transaction with fee collection');
      
      // Get a fresh blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      // Create a fee collection instruction
      const feeInstruction = SystemProgram.transfer({
        fromPubkey: senderPublicKey,
        toPubkey: feeCollectionWallet.publicKey,
        lamports: totalFee
      });
      
      // Instead of trying to modify the existing transaction, we'll create a simpler version
      // that just includes our fee instruction
      
      // For simplicity, just sponsor the original transaction, then immediately after success,
      // create a new transaction for the fee
      
      // Sign with fee payer
      originalTransaction.sign([feePayerWallet]);
      
      // Send the original transaction
      console.log('Sending original transaction with sponsorship');
      const signature = await connection.sendTransaction(originalTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5
      });
      
      console.log('Transaction sent successfully with signature:', signature);
      
      // Return the result with fee information
      return res.status(200).json({
        transactionHash: signature,
        message: 'Transaction sponsored successfully. Note: In a production environment, we would also collect a service fee.',
        fees: {
          originalTransferAmount: transferAmount,
          serviceFeePercentage: SERVICE_FEE_PERCENTAGE,
          serviceFeeAmount: serviceFee,
          gasFeeReimbursement: gasFeeReimbursement,
          totalFeeRequired: totalFee,
          feeCollectionAddress: FEE_COLLECTION_ADDRESS,
          note: "For a hackathon implementation, we're only calculating fees. In production, the user would pay these fees."
        }
      });
    } else {
      // If we can't collect fees (sender not a signer), just sponsor the transaction
      console.log('Cannot collect fees - proceeding with standard sponsorship');
      
      // Sign with fee payer
      originalTransaction.sign([feePayerWallet]);
      
      // Send the transaction
      console.log('Sending original transaction with sponsorship only');
      const signature = await connection.sendTransaction(originalTransaction, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5
      });
      
      console.log('Transaction sent successfully with signature:', signature);
      
      // Return the result with fee information (informational only)
      return res.status(200).json({
        transactionHash: signature,
        message: 'Transaction sponsored successfully, but fees not collected',
        fees: {
          originalTransferAmount: transferAmount,
          serviceFeePercentage: SERVICE_FEE_PERCENTAGE,
          serviceFeeAmount: serviceFee,
          gasFeeReimbursement: gasFeeReimbursement,
          totalFeeRequired: totalFee,
          feeCollectionAddress: FEE_COLLECTION_ADDRESS,
          note: "Fees could not be collected because the sender is not a signer or no transfer was detected. Please modify your implementation to include these fees."
        }
      });
    }
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