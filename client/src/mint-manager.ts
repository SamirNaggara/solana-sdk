import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class MintManager {
  private mintConfigPath: string;
  private connection: Connection;
  private mintAuthority: PublicKey;

  constructor(connection: Connection, mintAuthority: PublicKey) {
    this.connection = connection;
    this.mintAuthority = mintAuthority;
    this.mintConfigPath = join(process.cwd(), 'mint-config.json');
  }

  /**
   * Save mint configuration to file
   * @param mintAddress - The mint address to save
   */
  saveMintConfig(mintAddress: PublicKey): void {
    const config = {
      mintAddress: mintAddress.toString(),
      mintAuthority: this.mintAuthority.toString(),
      createdAt: new Date().toISOString()
    };
    writeFileSync(this.mintConfigPath, JSON.stringify(config, null, 2));
  }

  /**
   * Load mint configuration from file
   * @returns The mint PublicKey if found, null otherwise
   */
  loadMintConfig(): PublicKey | null {
    try {
      if (!existsSync(this.mintConfigPath)) {
        return null;
      }
      const config = JSON.parse(readFileSync(this.mintConfigPath, 'utf8'));
      return new PublicKey(config.mintAddress);
    } catch (error) {
      console.warn('Error loading mint config:', error);
      return null;
    }
  }

  /**
   * Check if a mint account exists on the blockchain
   * @param mintAddress - The mint address to check
   * @returns True if the mint exists, false otherwise
   */
  async mintExists(mintAddress: PublicKey): Promise<boolean> {
    try {
      const mintInfo = await this.connection.getAccountInfo(mintAddress);
      return mintInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize or load existing mint account
   * @returns PublicKey of the mint (existing or newly created)
   */
  async initializeMint(payerKeypair: Keypair): Promise<PublicKey> {
    // First, try to load existing mint from config
    const existingMint = this.loadMintConfig();
    
    if (existingMint) {
      // Verify the mint still exists on the blockchain
      const exists = await this.mintExists(existingMint);
      if (exists) {
        console.log(`Using existing mint: ${existingMint.toString()}`);
        return existingMint;
      } else {
        console.warn('Saved mint no longer exists on blockchain, creating new mint');
      }
    }

    // Create new mint if none exists or the saved one is invalid
    const payer = payerKeypair;
    console.log('Creating new mint...');
    const newMint = await createMint(
      this.connection, 
      payer, 
      this.mintAuthority, 
      null, 
      0,
      undefined, // keypair
      undefined, // confirmOptions
      TOKEN_PROGRAM_ID // Explicitly use standard Token program
    );
    
    // Save the new mint configuration
    this.saveMintConfig(newMint);
    console.log(`New mint created: ${newMint.toString()}`);
    
    return newMint;
  }

  /**
   * Check and top up SOL balance if needed
   * @param minBalance - Minimum SOL balance required (default: 0.1 SOL)
   * @returns True if balance was topped up, false if not needed
   */
  async checkAndTopUpBalance(payerKeypair: Keypair, minBalance: number = 0.1): Promise<boolean> {
    try {
      const payer = payerKeypair;
      const balance = await this.connection.getBalance(payer.publicKey);
      const balanceInSol = balance / 1e9; // Convert lamports to SOL
      
      console.log(`Current balance: ${balanceInSol} SOL`);
      
      if (balanceInSol < minBalance) {
        console.warn(`Balance too low (${balanceInSol} SOL), requesting airdrop...`);
        
        // Request airdrop (only works on devnet/testnet)
        const airdropAmount = Math.max(1, minBalance * 2); // Request at least 1 SOL or double the minimum
        const signature = await this.connection.requestAirdrop(
          payer.publicKey,
          airdropAmount * 1e9 // Convert SOL to lamports
        );
        
        // Confirm the airdrop
        await this.connection.confirmTransaction(signature);
        console.log(`Airdrop successful: ${airdropAmount} SOL added`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking/topping up balance:', error);
      throw new Error(`Failed to check or top up balance: ${error}`);
    }
  }

  /**
   * Get current SOL balance
   * @returns Balance in SOL
   */
  async getBalance(payerKeypair: Keypair): Promise<number> {
    const payer = payerKeypair;
    const balance = await this.connection.getBalance(payer.publicKey);
    return balance / 1e9; // Convert lamports to SOL
  }
}
