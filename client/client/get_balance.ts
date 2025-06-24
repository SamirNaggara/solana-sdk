import { Connection, PublicKey } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';

const getTokenBalance = async (
  connection: Connection,
  ownerPublicKey: PublicKey,
  mintPublicKey: PublicKey
): Promise<string> => {
  try {
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey,
      ownerPublicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log('Associated token address:', associatedTokenAddress.toBase58());

    const tokenAccount = await connection.getTokenAccountBalance(associatedTokenAddress);

    if (tokenAccount && tokenAccount.value) {
      console.log('Token Account Balance Response:', tokenAccount);
      return tokenAccount.value.amount;
    } else {
      console.log('No token account found or balance is zero.');
      return '0';
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 'Error fetching balance';
  }
};

export const getBalances = async (
  payerPublicKey: PublicKey,
  ownerPublicKey: PublicKey,
  mintPublicKey: PublicKey
): Promise<void> => {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  const payerBalance = await getTokenBalance(connection, payerPublicKey, mintPublicKey);
  console.log('Payer balance:', payerBalance);

  const ownerBalance = await getTokenBalance(connection, ownerPublicKey, mintPublicKey);
  console.log('Owner balance:', ownerBalance);
};
