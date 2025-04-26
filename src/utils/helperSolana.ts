import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Solana connection
export const getSolanaConnection = (): Connection => {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl);
};

// Get fee payer wallet from private key
export const getFeePayerWallet = (): Keypair => {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey || privateKey === 'your_solana_private_key_here') {
    console.warn('No valid private key found in .env, generating a temporary one for development');
    return Keypair.generate();
  }
  
  try {
    return Keypair.fromSecretKey(bs58.decode(privateKey));
  } catch (error) {
    console.error('Error decoding private key:', error);
    return Keypair.generate();
  }
};

// Check if fee payer has enough balance
export const checkFeePayerBalance = async (): Promise<{ hasBalance: boolean; balanceSol: number }> => {
  const connection = getSolanaConnection();
  const feePayerWallet = getFeePayerWallet();
  
  try {
    const balance = await connection.getBalance(feePayerWallet.publicKey);
    const balanceSol = balance / LAMPORTS_PER_SOL;
    
    // Consider a minimum balance threshold for safety
    const minBalance = 0.1; // SOL
    const hasBalance = balanceSol > minBalance;
    
    return { hasBalance, balanceSol };
  } catch (error) {
    console.error('Error checking fee payer balance:', error);
    return { hasBalance: false, balanceSol: 0 };
  }
};

// Calculate service fee based on transaction amount
export const calculateServiceFee = (amount: number): number => {
  const feePercentage = parseFloat(process.env.SERVICE_FEE_PERCENTAGE || '0.5');
  return amount * (feePercentage / 100);
};

// Validate transaction for security
export const validateTransaction = (
  feePayerAddress: string,
  accountKeys: { get: (index: number) => PublicKey | undefined },
  instructions: { programIdIndex: number; data: Uint8Array; accountKeyIndexes: number[] }[]
): { valid: boolean; error?: string } => {
  // Check for any unauthorized fund transfers
  for (const instruction of instructions) {
    // Fixed: using programIdIndex instead of programIndex
    const programId = accountKeys.get(instruction.programIdIndex);

    // Check if instruction is for System Program (transfers)
    if (programId && programId.toBase58() === '11111111111111111111111111111111') {
      // Check if it's a transfer (command 2)
      if (instruction.data[0] === 2) {
        const senderIndex = instruction.accountKeyIndexes[0];
        const senderAddress = accountKeys.get(senderIndex);

        // Don't allow transactions that transfer tokens from fee payer
        if (senderAddress && senderAddress.toBase58() === feePayerAddress) {
          return {
            valid: false,
            error: 'Transaction attempts to transfer funds from fee payer'
          };
        }
      }
    }
  }

  return { valid: true };
};