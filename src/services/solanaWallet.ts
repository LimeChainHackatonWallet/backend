import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate a new wallet for your backend
 * Only run this once to create your wallet!
 */
export function generateSponsorWallet(): void {
  // Create a new keypair
  const wallet = Keypair.generate();
  
  // Display wallet info
  console.log('Generated new sponsor wallet');
  console.log('Public Key:', wallet.publicKey.toBase58());
  console.log('Private Key:', bs58.encode(wallet.secretKey));
  
  // Save to .env file - CAUTION: handle this securely in production!
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } catch (error) {
    console.error('Error reading .env file:', error);
    return;
  }
  
  // Replace wallet key in .env
  const updatedContent = envContent.replace(
    /WALLET_PRIVATE_KEY=.*/,
    `WALLET_PRIVATE_KEY=${bs58.encode(wallet.secretKey)}`
  );
  
  try {
    fs.writeFileSync(envPath, updatedContent);
    console.log('Updated .env file with new wallet key');
    console.log('IMPORTANT: Fund this wallet with SOL to enable transaction sponsorship');
    console.log(`Solana Explorer: https://explorer.solana.com/address/${wallet.publicKey.toBase58()}?cluster=devnet`);
  } catch (error) {
    console.error('Error updating .env file:', error);
  }
}

// Command to generate a new wallet (run with ts-node src/utils/walletSetup.ts)
if (require.main === module) {
  generateSponsorWallet();
}