import type { JWK } from 'jose'

/** A row in the trust registry / issuer directory. */
export interface Issuer {
  id: string
  owner: string
  name: string
  did: string
  public_jwk: JWK
  accredited: boolean
  created_at: string
}

/** An encrypted credential held by the owner (zk-vault ciphertext). */
export interface CredentialRow {
  id: string
  owner: string
  label: string | null
  cipher: string
  iv: string
  created_at: string
}

/** A time-limited shareable presentation. */
export interface ShareRow {
  id: string
  owner: string
  presentation: string
  issuer_did: string
  revealed: string[]
  expires_at: string
  created_at: string
}
