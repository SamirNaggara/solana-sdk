#!/usr/bin/env ts-node

import { SafeoutSDK } from './class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';

async function testMintManagement() {
  console.log('🧪 Testing Mint Management...\n');

  // Configuration pour devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const mintAuthority = new PublicKey("11111111111111111111111111111112"); // System program comme exemple
  const owner = new PublicKey("11111111111111111111111111111112"); // System program comme exemple

  try {
    // Première initialisation
    console.log('📝 First SDK initialization...');
    const sdk1 = new SafeoutSDK(connection, mintAuthority, owner);
    await sdk1.init();
    
    const mintInfo1 = sdk1.getMintInfo();
    console.log('✅ First mint info:', mintInfo1);
    
    const balance1 = await sdk1.getBalance();
    console.log(`💰 Current balance: ${balance1} SOL\n`);

    // Deuxième initialisation (devrait réutiliser le même mint)
    console.log('📝 Second SDK initialization (should reuse mint)...');
    const sdk2 = new SafeoutSDK(connection, mintAuthority, owner);
    await sdk2.init();
    
    const mintInfo2 = sdk2.getMintInfo();
    console.log('✅ Second mint info:', mintInfo2);
    
    const balance2 = await sdk2.getBalance();
    console.log(`💰 Current balance: ${balance2} SOL\n`);

    // Vérification que les mints sont identiques
    if (mintInfo1.mintAddress === mintInfo2.mintAddress) {
      console.log('🎉 SUCCESS: Same mint address reused!');
      console.log(`📍 Mint address: ${mintInfo1.mintAddress}`);
    } else {
      console.log('❌ FAILURE: Different mint addresses created');
      console.log(`First: ${mintInfo1.mintAddress}`);
      console.log(`Second: ${mintInfo2.mintAddress}`);
    }

    // Test de top-up de balance
    console.log('\n💸 Testing balance top-up...');
    const wasToppedup = await sdk1.checkAndTopUpBalance(0.5); // Demande au moins 0.5 SOL
    if (wasToppedup) {
      console.log('✅ Balance was topped up');
      const newBalance = await sdk1.getBalance();
      console.log(`💰 New balance: ${newBalance} SOL`);
    } else {
      console.log('ℹ️ Balance was sufficient, no top-up needed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Exécution du test
if (require.main === module) {
  testMintManagement()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

export { testMintManagement };
