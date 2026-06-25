// scripts/decrypt-encrypted-auth.js
// 尝试用 AES key 解密 iCubeAuthInfo 中的加密值

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TRAE_DATA_DIR = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN';
const LOCAL_STATE_PATH = path.join(TRAE_DATA_DIR, 'Local State');
const STORAGE_PATH = path.join(TRAE_DATA_DIR, 'User', 'globalStorage', 'storage.json');

// 1. 提取 AES key
const localState = JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, 'utf8'));
const encryptedKeyBuf = Buffer.from(localState.os_crypt.encrypted_key, 'base64');
const dpapiEncrypted = encryptedKeyBuf.slice(5); // 去掉 "DPAPI" 前缀

const tempEnc = path.join(process.env.TEMP || 'C:\\Temp', 'trae-key.enc');
const tempDec = tempEnc + '.dec';
fs.writeFileSync(tempEnc, dpapiEncrypted);

const psScript = `Add-Type -AssemblyName System.Security; $bytes = [System.IO.File]::ReadAllBytes('${tempEnc}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.IO.File]::WriteAllBytes('${tempDec}', $decrypted); Write-Output $decrypted.Length`;
const result = execSync(`powershell -NoProfile -Command "${psScript}"`, { encoding: 'utf8', timeout: 15000 });
const aesKey = fs.readFileSync(tempDec);
console.log('AES Key:', aesKey.toString('hex'), '长度:', aesKey.length);
try { fs.unlinkSync(tempEnc); fs.unlinkSync(tempDec); } catch(e) {}

// 2. 读取 storage.json
const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));

// 3. 尝试解密加密的值
const encryptedKeys = [
  'iCubeAuthInfo://usertag',
  'iCubeAuthInfo://icube-dc:1124132644771876',
  'iCubeAuthInfo://icube.cloudide',
];

console.log('\n=== 尝试解密加密的 iCubeAuthInfo 值 ===\n');

for (const key of encryptedKeys) {
  const value = storage[key];
  const decoded = Buffer.from(value, 'base64');
  
  console.log('---', key, '---');
  console.log('解码后长度:', decoded.length);
  console.log('前10字节 (hex):', decoded.slice(0, 10).toString('hex'));
  
  // 前缀是 tc\x05\x10 (4字节)
  // 尝试不同的前缀长度
  for (const prefixLen of [3, 4, 5]) {
    const prefix = decoded.slice(0, prefixLen);
    const remaining = decoded.slice(prefixLen);
    
    // 尝试 AES-256-GCM: nonce(12) + ciphertext + tag(16)
    if (remaining.length < 28) continue;
    
    const nonce = remaining.slice(0, 12);
    const tag = remaining.slice(-16);
    const ciphertext = remaining.slice(12, -16);
    
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(ciphertext, null, 'utf8');
      decrypted += decipher.final('utf8');
      console.log(`✅ 前缀${prefixLen}字节 解密成功!`);
      console.log('明文 (前500字符):', decrypted.substring(0, 500));
      if (decrypted.length > 500) console.log('...(共', decrypted.length, '字符)');
      break;
    } catch (e) {
      // 尝试不带 tag 的 AES-256-CBC
    }
  }
  
  // 尝试 AES-256-CBC (前4字节前缀 + 16字节IV + 密文)
  console.log('尝试 AES-256-CBC...');
  for (const prefixLen of [4]) {
    const remaining = decoded.slice(prefixLen);
    if (remaining.length < 16) continue;
    
    const iv = remaining.slice(0, 16);
    const ciphertext = remaining.slice(16);
    
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      let decrypted = decipher.update(ciphertext, null, 'utf8');
      decrypted += decipher.final('utf8');
      console.log(`✅ AES-256-CBC (前缀${prefixLen}字节) 解密成功!`);
      console.log('明文 (前500字符):', decrypted.substring(0, 500));
      break;
    } catch (e) {
      // 失败
    }
  }
  
  console.log('');
}

// 4. 也输出明文 key 的完整内容
console.log('=== 明文 key 完整内容 ===\n');
const plaintextKey = 'iCubeAuthInfo://icube-dc:7o2d894p7dr0o4';
const plaintextValue = storage[plaintextKey];
const decoded = Buffer.from(plaintextValue, 'base64').toString('utf8');
const json = JSON.parse(decoded);
console.log(JSON.stringify(json, null, 2));
console.log('\n字段:');
console.log('  token:', json.token.substring(0, 50) + '...');
console.log('  refreshToken:', JSON.stringify(json.refreshToken));
console.log('  expiredAt:', json.expiredAt, '(Unix timestamp:', new Date(json.expiredAt * 1000).toISOString(), ')');
console.log('  userId:', json.userId);
