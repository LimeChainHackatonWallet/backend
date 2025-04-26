import { Connection, Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Default value in case API fails
const DEFAULT_SERVICE_FEE_PERCENTAGE = parseFloat(process.env.SERVICE_FEE_PERCENTAGE || '0.5');

interface FeeData {
  gasFeeLamports: number;      // Current gas fee in lamports
  serviceFeePercentage: number; // Current service fee percentage
  solPriceUsd: number | null;  // Current SOL price in USD (null if unavailable)
}

// Cache for fee data
let feeDataCache: FeeData | null = null;
let lastFeeDataUpdate = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get the current SOL price in USD from CoinGecko
 * @returns The SOL price in USD, or null if the API call fails
 */
async function getSolanaPrice(): Promise<number | null> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json() as any;
    return data.solana.usd;
  } catch (error) {
    console.warn('Failed to fetch Solana price:', error);
    return null;
  }
}

/**
 * Estimate the current gas fee for a typical Solana transaction
 * @param connection Solana connection
 * @returns Estimated gas fee in lamports
 */
async function estimateTransactionFee(connection: Connection): Promise<number> {
  try {
    // Create a dummy transaction to estimate fees
    const fromKeypair = Keypair.generate();
    const toKeypair = Keypair.generate();
    
    // Create a typical transaction similar to what our service processes
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    
    const instructions = [
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toKeypair.publicKey,
        lamports: 1000,
      }),
    ];
    
    // For a versioned transaction
    const messageV0 = new TransactionMessage({
      payerKey: fromKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    
    // Get fee estimate from RPC
    const fee = await connection.getFeeForMessage(messageV0);
    
    if (fee.value === null) {
      // Fallback to default if estimation fails
      return 5000;
    }
    
    return fee.value;
  } catch (error) {
    console.warn('Failed to estimate transaction fee:', error);
    // Default fee if estimation fails
    return 5000; // 0.000005 SOL (5,000 lamports)
  }
}

/**
 * Determine if we should adjust service fee percentage based on SOL price
 * For example, if SOL price is very high, we might want to lower our percentage
 * @param solPriceUsd Current SOL price in USD
 * @returns Adjusted service fee percentage
 */
function getAdjustedServiceFeePercentage(solPriceUsd: number | null): number {
  // Use default if price is unavailable
  if (solPriceUsd === null) {
    return DEFAULT_SERVICE_FEE_PERCENTAGE;
  }
  
  // Example logic: adjust fee percentage based on SOL price
  // Lower fee when SOL price is high, higher fee when SOL price is low
  if (solPriceUsd > 100) {
    return 0.3; // Lower fee when SOL is expensive
  } else if (solPriceUsd < 20) {
    return 0.7; // Higher fee when SOL is cheap
  } else {
    return 0.5; // Default fee for mid-range prices
  }
}

/**
 * Calculate service fee based on transfer amount and current rates
 * @param transferAmountLamports Amount in lamports
 * @param feePercentage Service fee percentage
 * @returns Service fee in lamports
 */
function calculateServiceFee(transferAmountLamports: number, feePercentage: number): number {
  // Calculate fee with minimum of 5,000 lamports
  const calculatedFee = Math.ceil(transferAmountLamports * (feePercentage / 100));
  return Math.max(calculatedFee, 5000);
}

/**
 * Get current fee data including gas fees and service fee percentage
 * @returns Current fee data
 */
export async function getCurrentFeeData(): Promise<FeeData> {
    const now = Date.now();
  
    // Return cached data if available and fresh
    if (feeDataCache && (now - lastFeeDataUpdate < CACHE_DURATION_MS)) {
      return feeDataCache;
    }
    
    // Otherwise, fetch fresh data
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    
    const [gasFeeLamports, solPriceUsd] = await Promise.all([
      estimateTransactionFee(connection),
      getSolanaPrice()
    ]);
    
    const serviceFeePercentage = getAdjustedServiceFeePercentage(solPriceUsd);
    
    // Update cache
    feeDataCache = {
      gasFeeLamports,
      serviceFeePercentage,
      solPriceUsd
    };
    
    lastFeeDataUpdate = now;
    
    return feeDataCache;
}

/**
 * Calculate all fees for a transaction
 * @param transferAmountLamports Amount being transferred in lamports
 * @returns Object containing all fee information
 */
export async function calculateAllFees(transferAmountLamports: number) {
  const { gasFeeLamports, serviceFeePercentage, solPriceUsd } = await getCurrentFeeData();
  
  // Calculate service fee based on current percentage
  const serviceFeeAmount = calculateServiceFee(transferAmountLamports, serviceFeePercentage);
  
  // Total fee is service fee plus gas reimbursement
  const totalFeeRequired = serviceFeeAmount + gasFeeLamports;
  
  // Calculate USD values if SOL price is available
  let usdValues = null;
  if (solPriceUsd !== null) {
    const lamportsToUsd = (lamports: number) => (lamports / 1_000_000_000) * solPriceUsd;
    
    usdValues = {
      transferAmountUsd: lamportsToUsd(transferAmountLamports),
      serviceFeeUsd: lamportsToUsd(serviceFeeAmount),
      gasFeeUsd: lamportsToUsd(gasFeeLamports),
      totalFeeUsd: lamportsToUsd(totalFeeRequired)
    };
  }
  
  return {
    originalTransferAmount: transferAmountLamports,
    serviceFeePercentage: serviceFeePercentage,
    serviceFeeAmount: serviceFeeAmount,
    gasFeeReimbursement: gasFeeLamports,
    totalFeeRequired: totalFeeRequired,
    usdValues: usdValues,
    solPriceUsd: solPriceUsd
  };
}