import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { calculateAllFees, getCurrentFeeData } from '../utils/feeCalculator';

async function testDynamicFees() {
  try {
    console.log('Testing dynamic fee calculation...');
    
    // Get current fee data
    const feeData = await getCurrentFeeData();
    
    console.log('Current Fee Data:');
    console.log(`- Gas Fee: ${feeData.gasFeeLamports} lamports (${feeData.gasFeeLamports / LAMPORTS_PER_SOL} SOL)`);
    console.log(`- Service Fee Percentage: ${feeData.serviceFeePercentage}%`);
    
    if (feeData.solPriceUsd !== null) {
      console.log(`- Current SOL Price: $${feeData.solPriceUsd.toFixed(2)} USD`);
    } else {
      console.log('- SOL Price: Not available');
    }
    
    // Test fee calculation for different amounts
    const testAmounts = [
      0.001 * LAMPORTS_PER_SOL,  // 0.001 SOL
      0.01 * LAMPORTS_PER_SOL,   // 0.01 SOL
      0.1 * LAMPORTS_PER_SOL,    // 0.1 SOL
      1 * LAMPORTS_PER_SOL,      // 1 SOL
      10 * LAMPORTS_PER_SOL      // 10 SOL
    ];
    
    console.log('\nFee Calculations for Different Amounts:');
    
    for (const amount of testAmounts) {
      const fees = await calculateAllFees(amount);
      
      console.log(`\nFor transfer amount: ${amount / LAMPORTS_PER_SOL} SOL`);
      console.log(`- Service Fee: ${fees.serviceFeeAmount / LAMPORTS_PER_SOL} SOL (${fees.serviceFeePercentage}%)`);
      console.log(`- Gas Fee: ${fees.gasFeeReimbursement / LAMPORTS_PER_SOL} SOL`);
      console.log(`- Total Fee: ${fees.totalFeeRequired / LAMPORTS_PER_SOL} SOL`);
      
      if (fees.usdValues) {
        console.log(`- Transfer Amount: $${fees.usdValues.transferAmountUsd.toFixed(4)} USD`);
        console.log(`- Total Fee: $${fees.usdValues.totalFeeUsd.toFixed(4)} USD`);
      }
    }
    
  } catch (error) {
    console.error('Error testing dynamic fees:', error);
  }
}

// Run the test
testDynamicFees();