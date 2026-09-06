# Changelog

## 2.0.0

Breaking: the SDK class is now `SolanaDppSdk`, exported from the package root. Versions 1.x exported `SafeoutSDK` from `dist/client/class_safeout.js`.

```typescript
// 1.x
import { SafeoutSDK } from 'solana-dpp';
// 2.x
import { SolanaDppSdk } from 'solana-dpp';
```

Also in this release: MIT license, authors, CI split into offline unit tests and devnet integration tests, secrets removed from the repository history.

## 1.5.0

Last release under the Safeout name.
