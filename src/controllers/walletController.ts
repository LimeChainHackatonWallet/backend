import { Request, Response } from 'express';
import { checkFeePayerBalance } from '../utils/helperSolana';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Get wallet health info for monitoring
 */
export const getWalletHealth = async (req: Request, res: Response) => {
  try {
    const { hasBalance, balanceSol } = await checkFeePayerBalance();
    
    // Get wallet address
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    let walletAddress = 'Unknown';
    
    try {
      if (privateKey && privateKey !== 'your_solana_private_key_here') {
        const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
        walletAddress = wallet.publicKey.toBase58();
      }
    } catch (error) {
      console.error('Error getting wallet address:', error);
    }
    
    return res.status(200).json({
      status: hasBalance ? 'healthy' : 'low_balance',
      balance: balanceSol,
      address: walletAddress,
      network: process.env.SOLANA_NETWORK || 'devnet'
    });
  } catch (error: any) {
    console.error('Error checking wallet health:', error);
    return res.status(500).json({
      error: 'Failed to check wallet health',
      details: error.message
    });
  }
};