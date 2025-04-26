import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fetch from 'node-fetch';
import bs58 from 'bs58';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Test the complete fee workflow with two steps:
 * 1. Prepare a transaction with fees
 * 2. Submit the signed transaction for sponsorship
 */
async function testCompleteFeeWorkflow() {
  try {
    console.log('Starting complete fee workflow test...');
    
    // 1. Connect to Solana
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // 2. Load the test wallet (must be funded)
    let testWallet: Keypair;
    const testWalletPath = './test-wallet.json';
    
    if (fs.existsSync(testWalletPath)) {
      // Load existing test wallet
      const data = fs.readFileSync(testWalletPath, 'utf8');
      const secretKey = new Uint8Array(JSON.parse(data));
      testWallet = Keypair.fromSecretKey(secretKey);
      console.log('Loaded test wallet');
    } else {
      console.error('Test wallet not found. Please run the fundTestWallet.ts script first.');
      return;
    }
    
    console.log('User wallet address:', testWallet.publicKey.toBase58());
    
    // 3. Check wallet balance
    const walletBalance = await connection.getBalance(testWallet.publicKey);
    console.log(`User wallet balance: ${walletBalance / LAMPORTS_PER_SOL} SOL`);
    
    if (walletBalance < 0.02 * LAMPORTS_PER_SOL) {
      console.error('Insufficient balance for test. Need at least 0.02 SOL');
      return;
    }
    
    // 4. Create a recipient wallet
    const recipientWallet = Keypair.generate();
    console.log('Recipient wallet address:', recipientWallet.publicKey.toBase58());
    
    // 5. Get backend wallet
    const FEE_PAYER_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
    if (!FEE_PAYER_PRIVATE_KEY) {
      console.error('Backend wallet private key not found in .env file');
      return;
    }
    
    const backendWallet = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_PRIVATE_KEY));
    console.log('Backend wallet address:', backendWallet.publicKey.toBase58());
    
    // Check backend balance before
    const backendBalanceBefore = await connection.getBalance(backendWallet.publicKey);
    console.log(`Backend wallet balance before: ${backendBalanceBefore / LAMPORTS_PER_SOL} SOL`);
    
    // 6. STEP 1: Call prepare-transaction endpoint
    console.log('\nSTEP 1: Preparing transaction with fees');
    
    const prepareResponse = await fetch('http://localhost:3000/api/prepare-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientAddress: recipientWallet.publicKey.toBase58(),
        amount: 0.01, // 0.01 SOL
        senderAddress: testWallet.publicKey.toBase58()
      })
    });
    
    if (!prepareResponse.ok) {
      const errorData = await prepareResponse.json();
      console.error('Failed to prepare transaction:', errorData);
      return;
    }
    
    const prepareData = await prepareResponse.json();
    console.log('Transaction prepared successfully');
    console.log('Fee details:', prepareData.fees);
    
    // 7. Deserialize and sign the transaction
    console.log('\nSigning prepared transaction with user wallet');
    const preparedTransactionBuffer = Buffer.from(prepareData.preparedTransaction, 'base64');
    const preparedTransaction = VersionedTransaction.deserialize(preparedTransactionBuffer);
    
    // Sign with user wallet
    preparedTransaction.sign([testWallet]);
    
    // Serialize again
    const signedTransaction = Buffer.from(preparedTransaction.serialize()).toString('base64');
    
    // 8. STEP 2: Send signed transaction for sponsorship
    console.log('\nSTEP 2: Submitting signed transaction for sponsorship');
    
    const sponsorResponse = await fetch('http://localhost:3000/api/sponsor-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: signedTransaction
      })
    });
    
    const sponsorData = await sponsorResponse.json();
    console.log('Response status:', sponsorResponse.status);
    console.log('Response data:', sponsorData);
    
    if (!sponsorResponse.ok) {
      console.error('Failed to sponsor transaction');
      return;
    }
    
    // 9. Verify transaction success
    console.log('\nTransaction was successfully sponsored! 🎉');
    console.log(`View transaction: https://explorer.solana.com/tx/${sponsorData.transactionHash}?cluster=devnet`);
    
    // 10. Wait for confirmation
    console.log('\nWaiting for confirmation...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 11. Check final balances
    const recipientBalance = await connection.getBalance(recipientWallet.publicKey);
    const userBalanceAfter = await connection.getBalance(testWallet.publicKey);
    const backendBalanceAfter = await connection.getBalance(backendWallet.publicKey);
    
    console.log(`\nFinal balances:`);
    console.log(`Recipient balance: ${recipientBalance / LAMPORTS_PER_SOL} SOL`);
    console.log(`User balance after: ${userBalanceAfter / LAMPORTS_PER_SOL} SOL`);
    console.log(`Backend wallet balance after: ${backendBalanceAfter / LAMPORTS_PER_SOL} SOL`);
    
    // 12. Calculate amounts
    const userSpent = walletBalance - userBalanceAfter;
    const backendProfit = backendBalanceAfter - backendBalanceBefore;
    
    console.log(`\nTransaction Summary:`);
    console.log(`- User sent: ${0.01} SOL to recipient`);
    console.log(`- User paid: ${userSpent / LAMPORTS_PER_SOL} SOL total (includes transfer + fees)`);
    console.log(`- Backend paid gas: ~${0.000005} SOL`);
    console.log(`- Backend profit: ${backendProfit / LAMPORTS_PER_SOL} SOL (fees collected - gas paid)`);
    
    if (backendProfit > 0) {
      console.log('✅ Fee collection successful! Backend profited from the transaction.');
    } else {
      console.log('❌ Fee collection issue. Backend did not profit.');
    }
    
  } catch (error) {
    console.error('Error in complete fee workflow test:', error);
  }
}

// Run the test
testCompleteFeeWorkflow();