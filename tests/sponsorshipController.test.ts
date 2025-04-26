import { Keypair, VersionedTransaction, TransactionMessage, SystemProgram, Connection } from '@solana/web3.js';
import { sponsorTransaction } from "../src/controllers/sponsorshipController";
import { Request, Response } from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

// Mock the Solana connection and sendTransaction method
jest.mock('@solana/web3.js', () => {
  const original = jest.requireActual('@solana/web3.js');
  return {
    ...original,
    Connection: jest.fn().mockImplementation(() => ({
      getLatestBlockhash: jest.fn().mockResolvedValue({
        blockhash: 'mockBlockhash',
        lastValidBlockHeight: 123456789
      }),
      sendTransaction: jest.fn().mockResolvedValue('mock-transaction-signature')
    }))
  };
});

// Mock the backend wallet setup
jest.mock('bs58', () => {
  const original = jest.requireActual('bs58');
  return {
    ...original,
    decode: jest.fn().mockImplementation(() => {
      // Generate a consistent keypair for testing
      const testKeypair = Keypair.generate();
      return testKeypair.secretKey;
    })
  };
});

describe('Sponsorship Controller', () => {
  // Create reusable keyPairs for testing
  const testFeePayer = Keypair.generate();
  const userWallet = Keypair.generate();
  const recipient = Keypair.generate();
  
  // Expose the fee payer public key for tests
  let backendFeePayerAddress: string;

  beforeAll(() => {
    // Save the backend fee payer address for comparison
    // This will be the address used in the controller due to our mocks
    backendFeePayerAddress = testFeePayer.publicKey.toBase58();
    
    // Replace the actual controller's fee payer with our test one
    // Note: In a real test, we'd use dependency injection instead
    // But for now we'll use this approach
    global.FEE_PAYER_ADDRESS = backendFeePayerAddress;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Test valid transaction case
  test('should successfully sponsor a valid transaction', async () => {
    // Mock Express request and response
    const req = {
      body: {
        transaction: await createValidTransaction(testFeePayer.publicKey, userWallet, recipient)
      }
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    // Execute the controller function
    await sponsorTransaction(req, res);

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionHash: 'mock-transaction-signature',
        message: 'Transaction sent successfully'
      })
    );
  });

  // Test missing transaction data
  test('should return 400 if transaction data is missing', async () => {
    const req = { body: {} } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await sponsorTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Missing transaction data'
      })
    );
  });

  // Test invalid fee payer
  test('should return 403 if fee payer is invalid', async () => {
    // Create transaction with wrong fee payer
    const wrongFeePayer = Keypair.generate(); // Different from backend's fee payer
    
    const req = {
      body: {
        transaction: await createValidTransaction(wrongFeePayer.publicKey, userWallet, recipient)
      }
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await sponsorTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Invalid fee payer in transaction'
      })
    );
  });

  // Test transaction stealing from fee payer
  test('should return 403 if transaction tries to steal from fee payer', async () => {
    const req = {
      body: {
        transaction: await createInvalidTransaction(testFeePayer)
      }
    } as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await sponsorTransaction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Transaction attempts to transfer funds from fee payer'
      })
    );
  });
});

// Helper function to create a valid test transaction
async function createValidTransaction(feePayerPublicKey, userWallet, recipient) {
  // Create a transfer instruction
  const transferAmount = 1000; // lamports
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: userWallet.publicKey, // User sends tokens
    toPubkey: recipient.publicKey,    // To recipient
    lamports: transferAmount
  });
  
  // Create transaction message with fee payer
  const messageV0 = new TransactionMessage({
    payerKey: feePayerPublicKey,      // Backend as fee payer
    recentBlockhash: 'mockBlockhash',
    instructions: [transferInstruction]
  }).compileToV0Message();
  
  // Create transaction
  const transaction = new VersionedTransaction(messageV0);
  
  // User signs their own instruction
  transaction.sign([userWallet]);
  
  // Serialize the transaction
  return Buffer.from(transaction.serialize()).toString('base64');
}

// Helper function to create an invalid transaction (stealing from fee payer)
async function createInvalidTransaction(feePayer) {
  const recipient = Keypair.generate();
  
  // Create a malicious transfer instruction
  const transferAmount = 1000; // lamports
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: feePayer.publicKey,   // Trying to steal from fee payer
    toPubkey: recipient.publicKey,    // To attacker's wallet
    lamports: transferAmount
  });
  
  // Create transaction message
  const messageV0 = new TransactionMessage({
    payerKey: feePayer.publicKey,      // Backend as fee payer
    recentBlockhash: 'mockBlockhash',
    instructions: [transferInstruction]
  }).compileToV0Message();
  
  // Create transaction
  const transaction = new VersionedTransaction(messageV0);
  
  // Attacker signs the transaction
  transaction.sign([feePayer]);
  
  // Serialize the transaction
  return Buffer.from(transaction.serialize()).toString('base64');
}