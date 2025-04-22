import dotenv from 'dotenv';

dotenv.config();

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    network: process.env.SOLANA_NETWORK || 'devnet',
  },
  webAuthn: {
    rpId: process.env.RP_ID || 'localhost',
    rpName: process.env.RP_NAME || 'Solana Wallet',
    origin: process.env.ORIGIN || 'http://localhost:3000',
  }
};