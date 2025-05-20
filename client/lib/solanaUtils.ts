import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import { ChipMetadata } from '../schema/metadata';

export const getPayerKeypair = async (): Promise<Keypair> => {
  const secretKey = fs.readFileSync('./keypair.json');
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey.toString())));
  return keypair;
};



export function deserializeMetadata(metadata: Buffer): ChipMetadata {
  return JSON.parse(metadata.toString()) as ChipMetadata;
}