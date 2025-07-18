import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

export const getPayerKeypair = async (): Promise<Keypair> => {
  const secretKey = fs.readFileSync('./keypair.json');
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey.toString())));
  return keypair;
};
