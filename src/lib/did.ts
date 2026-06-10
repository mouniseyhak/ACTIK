// did:web helpers and issuer key generation.
//
// For the MVP, the verifier resolves an issuer's public key from the Supabase
// `issuers` table (which doubles as the trust registry). In production you would
// instead resolve `did:web:rupp.edu.kh` by fetching
// https://rupp.edu.kh/.well-known/did.json and read the key from there.

import { generateKeyPair, exportJWK, type JWK } from 'jose'

export interface IssuerKeys {
  publicJwk: JWK
  privateJwk: JWK
}

export async function generateIssuerKeys(): Promise<IssuerKeys> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const publicJwk = await exportJWK(publicKey)
  const privateJwk = await exportJWK(privateKey)
  publicJwk.alg = 'ES256'
  privateJwk.alg = 'ES256'
  return { publicJwk, privateJwk }
}

/** Build a did:web identifier from a domain and optional path. */
export function didWeb(domain: string, path?: string): string {
  const base = `did:web:${encodeURIComponent(domain)}`
  if (!path) return base
  return base + ':' + path.split('/').filter(Boolean).map(encodeURIComponent).join(':')
}

/** The DID document an issuer would host at /.well-known/did.json in production. */
export function didDocument(did: string, publicJwk: JWK) {
  return {
    '@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/jwk/v1'],
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: publicJwk,
      },
    ],
    assertionMethod: [`${did}#key-1`],
  }
}
