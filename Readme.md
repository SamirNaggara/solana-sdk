# 🛡️ SafeoutSDK - Solana Mint & Metadata Verifier

> TypeScript SDK for creating, verifying, and managing Solana tokens with secure, hashed metadata stored via `memo`.

Safeout SDK stores product metadata in a dedicated Prisma‑managed database and automatically mints a Solana token for each item, embedding a SHA‑256 hash of that metadata in the transaction Memo, so integrity is anchored on‑chain without exposing the details. Brands simply pass a product UID and a JSON payload; the SDK abstracts all blockchain operations.

## 🚀 Features

- 🔐 Mint SPL tokens on Solana with embedded hashed metadata
- 📦 Create and manage associated token accounts (ATA)
- 🧾 Embed private metadata hashes via Memo instructions
- ✅ Verify metadata integrity directly on-chain
- 🌐 Interact with a database to fetch/update product metadata
- 🔄 Flexible configuration for API endpoints and network (Devnet, Testnet, Mainnet)
