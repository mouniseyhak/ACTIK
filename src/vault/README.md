# Add the zk-vault library here

This folder holds Actik's vault integration. The encryption engine itself is the
**zk-vault-react** library, which is distributed as source you copy in (not as an
npm package).

## Steps

1. Clone or download https://github.com/sengtha/zk-vault-react
2. Copy its `src/zk-vault/` directory to `src/vault/zk-vault/`
3. Copy its `src/components/` directory to `src/vault/components/`

After copying, this folder should look like:

```
src/vault/
  zk-vault/            <- copied from the library
  components/          <- copied from the library (VaultSetup, VaultUnlock, VaultSettings)
  vaultAdapter.ts      <- already here (Supabase storage adapter)
  zk-vault-contract.ts <- already here (adapter type contract)
```

The app imports `VaultProvider`, `useZkVault`, `encryptData`, `decryptData` from
`./vault/zk-vault`, and `VaultSetup` / `VaultUnlock` from `./vault/components/...`.
Until the library is copied in, `npm run build` will fail on those imports — that
is expected.

The library is zero-knowledge: encryption keys are derived in the browser from a
PIN or passkey and never reach Supabase. See its README for details, including the
**zero-recovery** caveat — which is why Actik keeps the issuer able to re-issue.
