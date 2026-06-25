const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Corrected analysis - properly decode the Base64 and analyze binary structure
const sampleBlob = "dGMFEAAAjC2WM0yt8z+dNeMQbabKNBoAsAB/6YDNwnsmr81pCnT8sGVlTIpZqYRoxGqojKIeEP4p0O3bbyYNs0bV1Ua6cx7VOsVRWhU16UJxIKBUyKMFzcn99T2tAZmpPLvXGoxreg97xON0pzLLVos0ZLYEoAlztrW9Fst386m1JkwtWFGs+6Qk2+Xcxv+PlUj9J715";

console.log('='.repeat(70));
console.log('Correct Base64 Decode of dGMFE');
console.log('='.repeat(70));

const buf = Buffer.from(sampleBlob, 'base64');
console.log(`\nTotal size: ${buf.length} bytes`);
console.log(`\nFull hex dump (first 64 bytes):`);
for (let i = 0; i < Math.min(64, buf.length); i += 16) {
  const hex = Array.from(buf.slice(i, i+16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  const ascii = Array.from(buf.slice(i, i+16)).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
  console.log(`  ${i.toString(16).padStart(4, '0')}: ${hex.padEnd(48)}  |${ascii}|`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('Header Analysis (first 8 bytes)');
console.log('='.repeat(70));

const magic = buf.readUInt32LE(0);
console.log(`\nMagic number (LE): 0x${magic.toString(16).padStart(8, '0')}`);
console.log(`Magic number (BE): 0x${buf.readUInt32BE(0).toString(16).padStart(8, '0')}`);
console.log(`As bytes: ${buf[0]} ${buf[1]} ${buf[2]} ${buf[3]} (0x${buf[0].toString(16)} 0x${buf[1].toString(16)} 0x${buf[2].toString(16)} 0x${buf[3].toString(16)})`);
console.log(`As ASCII: "${String.fromCharCode(buf[0])}${String.fromCharCode(buf[1])}${buf[2] < 32 ? '?' : String.fromCharCode(buf[2])}${buf[3] < 32 ? '?' : String.fromCharCode(buf[3])}"`);

// The 4 bytes after header might be a length field
const possibleLength = buf.readUInt32LE(4);
console.log(`\nBytes 4-7 as uint32 LE: ${possibleLength}`);
console.log(`Bytes 4-7 as uint32 BE: ${buf.readUInt32BE(4)}`);
console.log(`Bytes 4-7 hex: ${buf.slice(4, 8).toString('hex')}`);

// Check if bytes 4-7 could be a length
if (possibleLength < buf.length) {
  console.log(`  -> This could be a length field: ${possibleLength} (vs total ${buf.length})`);
  console.log(`  -> Payload would be bytes 8 to ${8 + possibleLength}`);
}

console.log(`\n${'='.repeat(70)}`);
console.log('Trying to identify encryption method from byte patterns');
console.log('='.repeat(70));

// Analyze byte distribution to guess encryption
const byteCounts = new Array(256).fill(0);
for (let i = 4; i < buf.length; i++) {
  byteCounts[buf[i]]++;
}
const avg = (buf.length - 4) / 256;
const chiSq = byteCounts.reduce((sum, c) => sum + (c - avg) ** 2 / avg, 0);
console.log(`\nByte frequency chi-squared: ${chiSq.toFixed(2)}`);
console.log(`  (Lower = more uniform = likely encrypted/compressed)`);
console.log(`  (~293 = random  => encrypted)`);
console.log(`  (~1500+ = text)  => not encrypted)`);

// Check for common encryption headers
// AES-GCM: usually has 12-byte nonce, then ciphertext, then 16-byte tag
// AES-CBC: 16-byte IV, then ciphertext
// ChaCha20: 12-byte nonce, then ciphertext, then 16-byte poly1305 tag

console.log(`\n${'='.repeat(70)}`);
console.log('Encryption Method Guessing');
console.log('='.repeat(70));

// If the format is: [4 magic][4 length?][N ciphertext]
// And size mod 16 = 6 (total size)
// Then: 4 (magic) + 4 (length) = 8, remaining = total - 8
// total = 150, remaining = 142, 142 mod 16 = 14... not aligned
// Wait, the analysis said "Size mod 16: 6" for the 150-byte blob
// 150 = 16*9 + 6, yes
// So if header is 4 bytes, then 146 remaining, 146 = 16*9 + 2... also not aligned
// 
// Actually, the Base64 might have padding issues. Let me recalculate.
// 
// The blob is Base64 encoded. Let me check the actual decoded size.
// "dGMFEAAAjC2WM0yt8z+dNeMQbabKNBoAsAB/6YDNwnsmr81pCnT8sGVlTIpZqYRoxGqojKIeEP4p0O3bbyYNs0bV1Ua6cx7VOsVRWhU16UJxIKBUyKMFzcn99T2tAZmpPLvXGoxreg97xON0pzLLVos0ZLYEoAlztrW9Fst386m1JkwtWFGs+6Qk2+Xcxv+PlUj9J715"
// Let me count: approximately 200 chars, Base64 → ~150 bytes. That matches.

// The key insight: we need to find Trae CN's source code to understand the encryption.
// Let's search for encryption-related strings in Trae CN's installation.

console.log(`
  
To decode the iCubeAuthInfo blob, we need to:

1. FIND TRAE CN'S ENCRYPTION CODE
   Search Trae CN's installation for:
   - "iCubeAuthInfo" string (to find where it's written/read)
   - "createCipher" or "createDecipheriv" (Node.js crypto)
   - "safeStorage" (Electron's safe encryption)
   - "CryptProtectData" (Windows DPAPI)
   - "encrypt" or "decrypt" functions

2. COMMON PATTERNS IN ELECTRON APPS:
   a. Using Electron's safeStorage (encrypted with OS keychain)
   b. Using a hardcoded key + AES
   c. Using machine-specific key (derived from MAC address, etc.)

3. FOR TRAE CN SPECIFICALLY:
   The "icube-dc" in the key name suggests "iCube Data Center"
   The encryption might be in a file like:
   - auth-encrypt.js
   - security.js
   - storage.js
   - icube-auth.js

Can you provide the path to Trae CN's installation directory?
(Usually in: C:\\Users\\[username]\\AppData\\Local\\Programs\\Trae CN\\)
`);
