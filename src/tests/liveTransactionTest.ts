import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

/**
 * This script creates a test wallet and funds it from your backend wallet
 * so you can use it for testing without relying on airdrops
 */
async function fundTestWallet() {
  try {
    console.log('Starting test wallet funding...');
    
    // Connect to Solana
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Get backend wallet from .env
    const backendPrivateKey = process.env.WALLET_PRIVATE_KEY;
    if (!backendPrivateKey) {
      throw new Error('No wallet private key found in .env file');
    }
    
    const backendWallet = Keypair.fromSecretKey(bs58.decode(backendPrivateKey));
    
    // Create a new test wallet or load existing one
    let testWallet: Keypair;
    const testWalletPath = './test-wallet.json';
    
    if (fs.existsSync(testWalletPath)) {
      // Load existing test wallet
      const data = fs.readFileSync(testWalletPath, 'utf8');
      const secretKey = new Uint8Array(JSON.parse(data));
      testWallet = Keypair.fromSecretKey(secretKey);
      console.log('Loaded existing test wallet');
    } else {
      // Create new test wallet
      testWallet = Keypair.generate();
      // Save it for future use
      fs.writeFileSync(testWalletPath, JSON.stringify(Array.from(testWallet.secretKey)));
      console.log('Created new test wallet');
    }
    
    console.log('Test wallet address:', testWallet.publicKey.toBase58());
    
    // Check backend wallet balance
    const backendBalance = await connection.getBalance(backendWallet.publicKey);
    console.log(`Backend wallet balance: ${backendBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Check test wallet balance
    const testWalletBalance = await connection.getBalance(testWallet.publicKey);
    console.log(`Test wallet balance before: ${testWalletBalance / LAMPORTS_PER_SOL} SOL`);
    
    // Transfer 0.1 SOL to test wallet if its balance is low
    if (testWalletBalance < 0.05 * LAMPORTS_PER_SOL) {
      console.log('Funding test wallet with 0.1 SOL...');
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: backendWallet.publicKey,
          toPubkey: testWallet.publicKey,
          lamports: 0.1 * LAMPORTS_PER_SOL
        })
      );
      
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [backendWallet]
      );
      
      console.log('Funding transaction signature:', signature);
      console.log('View transaction: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
      
      // Check test wallet balance after funding
      const newBalance = await connection.getBalance(testWallet.publicKey);
      console.log(`Test wallet balance after: ${newBalance / LAMPORTS_PER_SOL} SOL`);
    } else {
      console.log('Test wallet already has sufficient funds');
    }
    
    // Output the test wallet details for use in other scripts
    console.log('\nTest Wallet Details:');
    console.log('Address:', testWallet.publicKey.toBase58());
    console.log('Private Key (for testing only):', bs58.encode(testWallet.secretKey));
    
  } catch (error) {
    console.error('Error funding test wallet:', error);
  }
}

// Run the funding
fundTestWallet();