# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SafeoutSDK is a TypeScript SDK for creating, verifying, and managing Solana SPL tokens with secure metadata storage via memo instructions. The project enables minting tokens with embedded hashed metadata and provides a complete API for managing digital product passports (DPP) on the Solana blockchain.

## Common Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in `dist/`
- `npm start` - Run the main minting script (mintToken.ts)
- `tsc` - Direct TypeScript compilation

### Testing
- `npm test` - Run all Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:mint` - Run mint management tests specifically
- `npm run test:mint:unit` - Run unit tests for mint management
- `npm run test:mint:integration` - Run integration tests for mint management
- `npm run test:user-normalization` - Run user normalization tests

### Database Operations
- `npm run db:migrate` - Run database migrations
- `npm run db:setup` - Setup database (runs migrations)

## Architecture

### Core Structure
- **client/class_safeout.ts** - Main SDK class (`SafeoutSDK`) that orchestrates all operations
- **client/src/** - Core implementation modules:
  - `database-manager.ts` - PostgreSQL database operations
  - `token-manager.ts` - Solana token operations and metadata handling
  - `mint-manager.ts` - Token minting operations
  - `history-manager.ts` - Transaction history tracking
  - `types.ts` - TypeScript interfaces and types
  - `validation.ts` - Input validation utilities
- **client/lib/solanaUtils.ts** - Solana blockchain utilities
- **client/cli.ts** - Command-line interface
- **client/SchemaZod.ts** - Zod validation schemas

### Key Design Patterns
The SDK uses a modular manager pattern where `SafeoutSDK` coordinates specialized managers:
- Each manager handles a specific domain (database, tokens, minting, history)
- Managers are lazily initialized when needed
- The main class provides a unified interface for all operations

### Database Integration
- Uses PostgreSQL for metadata and history storage
- Migrations in `migrations/` directory
- Database schema includes product metadata, mint history, and visibility tracking
- Environment configuration via `.env` files

### Testing Strategy
- Comprehensive test suites covering unit, integration, and regression testing
- Tests organized by functionality (mint management, user normalization, etc.)
- Uses Jest with TypeScript support
- Separate test configurations for different test types

## Configuration

### Environment Variables
Required environment variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string

### TypeScript Configuration
- Target: ES2020 with NodeNext modules
- Strict mode enabled
- Declaration files generated in `dist/`
- Source maps and isolated modules

## Development Notes

- The project compiles TypeScript from `client/` to `dist/`
- Main entry point is `client/class_safeout.ts`
- Uses Solana Web3.js v1.98.2 and SPL Token libraries
- Database operations require PostgreSQL setup
- All Solana operations work with devnet/testnet/mainnet configuration