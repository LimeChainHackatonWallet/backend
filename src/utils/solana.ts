import { 
    Connection, 
    Keypair, 
    PublicKey, 
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction
  } from '@solana/web3.js';
  import * as nacl from 'tweetnacl';
  import * as bs58 from 'bs58';
  import config from '../config';
  import crypto from 'crypto';
  
  // Initialize Solana connection
  const connection = new Connection(config.solana.rpcUrl);
  
  /**
   * Derive private key from credential ID
   * @param credentialId WebAuthn credential ID
   */
  export const derivePrivateKey = (credentialId: Buffer): Uint8Array => {
    // Use a cryptographic hash function to derive a deterministic private key
    const hash = crypto.createHash('sha256');
    hash.update(credentialId);
    const seed = hash.digest();
  
    // Use the seed to generate a proper Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));
                    
    // Return the full 64-byte secret key (includes public key)
    return keyPair.secretKey;
  };
  
  /**
   * Create Solana keypair from a private key
   * @param privateKey Private key as Uint8Array
   */
  export const createKeypairFromPrivateKey = (privateKey: Uint8Array): Keypair => {
    try {
        // Ensure the private key is the correct length for Solana
        if (privateKey.length !== 64) {
          throw new Error(`Invalid private key length: ${privateKey.length}. Expected 64 bytes.`);
        }
        
        return Keypair.fromSecretKey(privateKey);
      } catch (error) {
        console.error('Error creating keypair:', error);
        throw new Error('Failed to create Solana keypair from private key');
      }
  };
  
  /**
   * Get Solana account info
   * @param publicKey Solana public key
   */
  export const getAccountInfo = async (publicKey: PublicKey) => {
    const balance = await connection.getBalance(publicKey);
    return {
      publicKey: publicKey.toString(),
      balance: balance / LAMPORTS_PER_SOL,
    };
  };
  
  /**
   * Transfer SOL to another address
   * @param fromKeypair Sender's keypair
   * @param toAddress Recipient's address
   * @param amount Amount in SOL to send
   */
  export const transferSol = async (
    fromKeypair: Keypair,
    toAddress: string,
    amount: number
  ) => {
    const toPublicKey = new PublicKey(toAddress);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair]
    );
    
    return {
      signature,
      status: 'success',
    };
  };
  
  /**
   * Sign a message with a keypair
   * @param keypair Signer's keypair
   * @param message Message to sign
   */
  export const signMessage = (keypair: Keypair, message: string) => {
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    return bs58.encode(signature);
  };
  
  /**
   * Request airdrop of SOL (for testing on devnet)
   * @param publicKey Address to receive the airdrop
   * @param amount Amount in SOL
   */
  export const requestAirdrop = async (publicKey: PublicKey, amount: number = 1) => {
    const signature = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);
    return {
      signature,
      amount,
      status: 'success',
    };
  };