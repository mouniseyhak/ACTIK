// Run with: npm run test:sdjwt
// Proves the SD-JWT core round-trips: issue -> selectively present -> verify.
import { generateIssuerKeys, didWeb } from './src/lib/did.ts'
import { issueSdJwt, present, verify, readDisclosures } from './src/lib/sdjwt.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error('FAIL: ' + msg)
  console.log('  ok -', msg)
}

const { publicJwk, privateJwk } = await generateIssuerKeys()
const issuerDid = didWeb('rupp.edu.kh')
console.log('issuer DID:', issuerDid)

const full = await issueSdJwt({
  issuerDid,
  issuerPrivateJwk: privateJwk,
  vct: 'https://actik.kh/credentials/degree',
  subject: {
    name: 'សុខ ដារ៉ា',
    degree: 'BSc in Information Technology',
    university: 'Royal University of Phnom Penh',
    year: 2025,
    gpa: 3.8,
    national_id: '012345678',
  },
  expiresInSec: 3600,
})
assert(readDisclosures(full).length === 6, 'full credential holds all 6 disclosures')

const presentation = present(full, ['name', 'degree', 'university', 'year'])
assert(readDisclosures(presentation).length === 4, 'presentation holds only 4 disclosures')

const res = await verify(presentation, publicJwk)
console.log('\nverify result:', JSON.stringify(res, null, 2))
assert(res.valid, 'presentation verifies')
assert(res.issuer === issuerDid, 'issuer matches')
assert(res.claims.name === 'សុខ ដារ៉ា', 'Khmer name survived round-trip')
assert(res.claims.gpa === undefined, 'hidden gpa is NOT visible to verifier')
assert(res.claims.national_id === undefined, 'hidden national_id is NOT visible')

const other = await generateIssuerKeys()
assert(!(await verify(presentation, other.publicJwk)).valid, 'fails with wrong issuer key')

const expired = await issueSdJwt({ issuerDid, issuerPrivateJwk: privateJwk, vct: 'test', subject: { x: 1 }, expiresInSec: -10 })
assert(!(await verify(present(expired, ['x']), publicJwk)).valid, 'expired credential fails')

console.log('\nALL TESTS PASSED')
