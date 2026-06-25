const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Read the actual auth blob from storage.json
const storagePath = path.join(
  process.env.APPDATA || '',
  'Trae CN',
  'User',
  'globalStorage',
  'storage.json'
);

let authBlob = null;
let authKeyName = null;

try {
  if (fs.existsSync(storagePath)) {
    const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    const keys = Object.keys(storage).filter(k => k.startsWith('iCubeAuthInfo://'));
    if (keys.length > 0) {
      // Use the first auth key found
      authKeyName = keys[0];
      authBlob = storage[authKeyName];
      console.log(`Using key: ${authKeyName}`);
      console.log(`Blob length: ${authBlob.length}`);
    }
  }
} catch (e) {
  console.error('Could not read storage.json:', e.message);
}

if (!authBlob) {
  console.log('No auth blob found. Please make sure Trae CN is installed and you have logged in.');
  process.exit(1);
}

const buf = Buffer.from(authBlob, 'base64');
console.log(`\nDecoded buffer size: ${buf.length} bytes`);
console.log(`Header: ${buf.slice(0, 4).toString('utf8')}`);
console.log(`First 32 bytes hex: ${buf.slice(0, 32).toString('hex')}`);

// Analysis of the format
console.log(`\n${'='.repeat(60)}`);
console.log(`Format Analysis`);
console.log(`${'='.repeat(60)}`);

// Check if it could be AES-256-CBC or AES-256-GCM
// Common pattern: [4 bytes magic][1 byte version][...][16 bytes AES block aligned]
const version = buf[4];
console.log(`\nVersion byte (offset 4): 0x${version.toString(16)} = ${version}`);

// Try to find a pattern in the byte structure
// Common encryption headers:
// - NaCl/libsodium: 24-byte nonce + encrypted data
// - AES-GCM: 12-byte nonce + ciphertext + 16-byte tag
// - AES-CBC: 16-byte IV + ciphertext

const possibleStructures = [
  { name: 'AES-256-CBC', ivSize: 16, blockSize: 16 },
  { name: 'AES-256-GCM', nonceSize: 12, tagSize: 16 },
  { name: 'ChaCha20-Poly1305', nonceSize: 12, tagSize: 16 },
  { name: 'libsodium sealed box', overhead: 48 },
];

console.log(`\nBuffer size: ${buf.length}`);
console.log(`Size - 4 (header) = ${buf.length - 4}`);
console.log(`Size - 4 - 16 (possible IV) = ${buf.length - 4 - 16}`);
console.log(`Size - 4 - 12 (possible nonce) = ${buf.length - 4 - 12}`);

// The "dGMFE" prefix
// dGMFE in Base64 = 0x74634645 in hex
// t C F E  (in ASCII)
// This could be a magic number specific to Trae/iCube
console.log(`\nMagic number "tCFE" (0x74634645) analysis:`);
console.log(`  This is likely a custom format identifier`);
console.log(`  Format might be: [tCFE][1 byte version][...data...]`);

// Let's check if Trae CN uses Electron's safeStorage
// Electron safeStorage uses OS keychain (Windows: DPAPI, macOS: Keychain, Linux: password-store)
// The encrypted data would be OS-specific

console.log(`\n${'='.repeat(60)}`);
console.log(`Decryption Attempts`);
console.log(`${'='.repeat(60)}`);

// Approach 1: Check if this is DPAPI encrypted (Windows)
// DPAPI encrypted data starts with different headers
// But Electron's safeStorage on Windows uses DPAPI via CryptProtectData

// Approach 2: Try common passwords (probably won't work but worth checking)
const commonPasswords = [
  'icube',
  'trae',
  'trae.cn',
  'Trae CN',
  'auth_key',
  '',
];

console.log(`\nTrying common passwords with AES-256-CBC...`);
for (const pwd of commonPasswords) {
  try {
    const key = crypto.createHash('sha256').update(pwd).digest();
    // Try with first 16 bytes after header as IV
    const iv = buf.slice(5, 21);
    const ciphertext = buf.slice(21);
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    const hasPrintable = decrypted.toString('utf8').match(/[\x20-\x7e]{8,}/);
    if (hasPrintable) {
      console.log(`  Password "${pwd}": ${hasPrintable[0].substring(0, 50)}`);
    }
  } catch (e) {
    // Ignore decryption errors
  }
}

console.log(`\n(No results expected - Trae CN likely uses OS-level encryption)`);

console.log(`\n${'='.repeat(60)}`);
console.log(`Conclusion`);
console.log(`${'='.repeat(60)}`);
console.log(`
The iCubeAuthInfo blobs appear to be encrypted with:
1. Either Electron's safeStorage (OS keychain-backed)
2. Or a custom encryption using a key derived from Trae CN's source code

If using safeStorage:
- Windows: DPAPI (CryptProtectData) - tied to Windows user account
- Cannot decrypt without being in the same Windows session
- Even if we could decrypt, the data is only valid for the current machine

If using custom encryption:
- Need to find the key in Trae CN's main bundle (\\%LOCALAPPDATA%/Trae CN/)
- Likely in a .js file that handles authentication

Recommended approach:
1. Search Trae CN's installation directory for encryption-related code
2. Look for "createCipher", "createDecipheriv", "safeStorage", "encrypt", "decrypt" 
3. Or accept that we cannot decrypt and continue using capture-restore approach
`);
