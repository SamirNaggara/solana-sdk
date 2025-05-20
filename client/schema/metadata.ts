import { PublicKey } from '@solana/web3.js';

export interface ChipMetadata {
    name: string;
    description: string;
    isStolen: boolean;
    extraInfo: string;
    owner: PublicKey;
}
