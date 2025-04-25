import { Connection, Keypair, VersionedTransaction, TransactionMessage, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fetch from 'node-fetch';
import bs58 from 'bs58';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test transaction sponsorship with fee calculation (hackathon implementation)
 */
async function testFeeCollection() {
  try {
    console.log('Starting transaction sponsorship and fee calculation test...');
    
    // 1. Connect to Solana
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // 2. Get backend wallet from .env
    const backendPrivateKey = process.env.WALLET_PRIVATE_KEY;
    if (!backendPrivateKey) {
      throw new Error('No wallet private key found in .env file');
    }
    
    const backendWallet = Keypair.fromSecretKey(bs58.decode(backendPrivateKey));
    console.log('Backend wallet address:', backendWallet.publicKey.toBase58());
    
    // 3. Load or create test wallet
    let testWallet: Keypair;
    const testWalletPath = './test-wallet.json';
    
    if (fs.existsSync(testWalletPath)) {
      // Load existing test wallet
      const data = fs.readFileSync(testWalletPath, 'utf8');
      const secretKey = new Uint8Array(JSON.parse(data));
      testWallet = Keypair.fromSecretKey(secretKey);
      console.log('Loaded test wallet');
    } else {
      // Create new test wallet
      testWallet = Keypair.generate();
      fs.writeFileSync(testWalletPath, JSON.stringify(Array.from(testWallet.secretKey)));
      console.log('Created new test wallet - funding required');
      
      // Fund the test wallet - FIX: Create the transaction correctly
      console.log('Funding test wallet with 0.1 SOL from backend wallet...');
      
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      
      // Create the versioned transaction
      const transferMessage = new TransactionMessage({
        payerKey: backendWallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          SystemProgram.transfer({
            fromPubkey: backendWallet.publicKey,
            toPubkey: testWallet.publicKey,
            lamports: 0.1 * LAMPORTS_PER_SOL
          })
        ]
      }).compileToV0Message();
      
      const fundingTransaction = new VersionedTransaction(transferMessage);
      fundingTransaction.sign([backendWallet]);
      
      // Send and confirm the funding transaction
      const fundingSignature = await connection.sendTransaction(fundingTransaction);
      console.log('Funding transaction sent with signature:', fundingSignature);
      
      // Wait for confirmation
      await connection.confirmTransaction({
        signature: fundingSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      });
      
      console.log('Test wallet funded with 0.1 SOL');
    }
    
    console.log('Test wallet address:', testWallet.publicKey.toBase58());
    
    // 4. Check test wallet balance
    const testWalletBalance = await connection.getBalance(testWallet.publicKey);
    console.log(`Test wallet balance: ${testWalletBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (testWalletBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log('Test wallet has insufficient funds - need at least 0.01 SOL');
      console.log('Please run the fundTestWallet script first');
      return;
    }
    
    // 5. Create a recipient wallet
    const recipientWallet = Keypair.generate();
    console.log('Recipient wallet address:', recipientWallet.publicKey.toBase58());
    
    // 6. Check backend balance before transaction
    const backendBalanceBefore = await connection.getBalance(backendWallet.publicKey);
    console.log(`Backend wallet balance before: ${backendBalanceBefore / LAMPORTS_PER_SOL} SOL`);
    
    // 7. Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    console.log('Using blockhash:', blockhash);
    
    // 8. Create a transfer transaction - user sends 0.01 SOL to recipient
    const transferAmount = 0.01 * LAMPORTS_PER_SOL;
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: testWallet.publicKey,
      toPubkey: recipientWallet.publicKey,
      lamports: transferAmount
    });
    
    // 9. Create transaction message with backend wallet as fee payer
    const messageV0 = new TransactionMessage({
      payerKey: backendWallet.publicKey,  // Backend pays gas
      recentBlockhash: blockhash,
      instructions: [transferInstruction]
    }).compileToV0Message();
    
    // 10. Create and sign transaction
    const transaction = new VersionedTransaction(messageV0);
    
    // IMPORTANT: User (test wallet) must sign their instruction
    transaction.sign([testWallet]);
    
    // 11. Serialize the transaction
    const serializedTransaction = Buffer.from(
      transaction.serialize()
    ).toString('base64');
    
    console.log('Transaction created and signed by user');
    
    // 12. Send to sponsorship endpoint
    console.log('Sending transaction to sponsorship endpoint...');
    const response = await fetch('http://localhost:3000/api/sponsor-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: serializedTransaction
      })
    });
    
    // 13. Process the response
    const responseData = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', responseData);
    
    if (response.status === 200 && responseData.transactionHash) {
      console.log('\nTransaction was successfully sponsored! 🎉');
      console.log(`View transaction: https://explorer.solana.com/tx/${responseData.transactionHash}?cluster=devnet`);
      
      // 14. Wait for confirmation
      console.log('\nWaiting for confirmation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 15. Check balances after transaction
      const recipientBalance = await connection.getBalance(recipientWallet.publicKey);
      const testWalletBalanceAfter = await connection.getBalance(testWallet.publicKey);
      const backendBalanceAfter = await connection.getBalance(backendWallet.publicKey);
      
      console.log(`Recipient balance: ${recipientBalance / LAMPORTS_PER_SOL} SOL`);
      console.log(`Test wallet balance after: ${testWalletBalanceAfter / LAMPORTS_PER_SOL} SOL`);
      console.log(`Backend wallet balance after: ${backendBalanceAfter / LAMPORTS_PER_SOL} SOL`);
      
      // 16. Calculate how much the user spent and backend spent
      const userSpent = testWalletBalance - testWalletBalanceAfter;
      const backendSpent = backendBalanceBefore - backendBalanceAfter;
      
      console.log(`\nTransaction Summary:`);
      console.log(`- Original transfer amount: ${transferAmount / LAMPORTS_PER_SOL} SOL`);
      console.log(`- Test wallet spent: ${userSpent / LAMPORTS_PER_SOL} SOL`);
      console.log(`- Backend wallet spent: ${backendSpent / LAMPORTS_PER_SOL} SOL (gas fee)`);
      
      if (recipientBalance >= transferAmount) {
        console.log('✅ Transfer confirmed! Recipient received the funds.');
      } else {
        console.log('❌ Transfer not confirmed. Recipient did not receive funds.');
      }
      
      // 17. Display fee information from the response
      if (responseData.fees) {
        console.log(`\nFee Information (from sponsorship service):`);
        console.log(`- Service fee percentage: ${responseData.fees.serviceFeePercentage}%`);
        console.log(`- Service fee amount: ${responseData.fees.serviceFeeAmount / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Gas fee reimbursement: ${responseData.fees.gasFeeReimbursement / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Total fee calculated: ${(responseData.fees.totalFeeRequired || responseData.fees.totalFeeCollected) / LAMPORTS_PER_SOL} SOL`);
        console.log(`- Fee collection address: ${responseData.fees.feeCollectionAddress}`);
        
        if (responseData.fees.note) {
          console.log(`- Note: ${responseData.fees.note}`);
        }
      }
      
      // 18. For hackathon: Show what the user would pay in a production environment
      console.log(`\nIn a production environment:`);
      console.log(`- User would transfer: ${transferAmount / LAMPORTS_PER_SOL} SOL to recipient`);
      console.log(`- User would also pay: ${(responseData.fees?.totalFeeRequired || responseData.fees?.totalFeeCollected || 0) / LAMPORTS_PER_SOL} SOL in fees`);
      console.log(`- Total cost to user: ${(transferAmount + (responseData.fees?.totalFeeRequired || responseData.fees?.totalFeeCollected || 0)) / LAMPORTS_PER_SOL} SOL`);
      
    } else {
      console.log('❌ Transaction sponsorship failed');
    }
    
  } catch (error) {
    console.error('Error in fee collection test:', error);
  }
}

// Run the test
testFeeCollection();