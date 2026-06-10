// The storage-adapter contract Actik relies on from zk-vault-react.
// Defined locally so the adapter typechecks regardless of the library's
// internal file layout (TypeScript matches it structurally).

export interface VaultEnvelopes {
  pinEnvelope: string | null
  pinSalt: string | null
  passkeyEnvelope: string | null
  passkeyId: string | null
}

export interface IVaultStorageAdapter {
  loadEnvelopes: (userId: string) => Promise<VaultEnvelopes>
  saveEnvelopes: (userId: string, envelopes: Partial<VaultEnvelopes>) => Promise<void>
}
