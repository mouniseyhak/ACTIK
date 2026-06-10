// Supabase storage adapter for zk-vault-react.
//
// zk-vault is zero-knowledge: these columns only ever hold ciphertext / random
// strings. The encryption keys are derived in the browser from the user's PIN
// or passkey and never reach Supabase.
//
// Implements the IVaultStorageAdapter interface documented in the library:
//   https://github.com/sengtha/zk-vault-react
//
// NOTE: you must copy the library source into src/vault/ first (see README),
// which provides the IVaultStorageAdapter type used below.

import { supabase } from '../lib/supabaseClient'
import type { IVaultStorageAdapter } from './zk-vault-contract'

export const supabaseVaultAdapter: IVaultStorageAdapter = {
  loadEnvelopes: async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('vault_envelope_pin, vault_pin_salt, vault_envelope_passkey, passkey_id')
      .eq('id', userId)
      .single()

    if (!data) {
      return { pinEnvelope: null, pinSalt: null, passkeyEnvelope: null, passkeyId: null }
    }
    return {
      pinEnvelope: data.vault_envelope_pin,
      pinSalt: data.vault_pin_salt,
      passkeyEnvelope: data.vault_envelope_passkey,
      passkeyId: data.passkey_id,
    }
  },

  saveEnvelopes: async (userId: string, envelopes) => {
    const updates: Record<string, unknown> = { id: userId }
    if (envelopes.pinEnvelope !== undefined) updates.vault_envelope_pin = envelopes.pinEnvelope
    if (envelopes.pinSalt !== undefined) updates.vault_pin_salt = envelopes.pinSalt
    if (envelopes.passkeyEnvelope !== undefined) updates.vault_envelope_passkey = envelopes.passkeyEnvelope
    if (envelopes.passkeyId !== undefined) updates.passkey_id = envelopes.passkeyId

    // upsert so the row is created on first vault setup.
    await supabase.from('profiles').upsert(updates)
  },
}
