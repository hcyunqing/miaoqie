// scripts/decrypt-v2.js
// 尝试更多解密方式

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const TRAE_DATA_DIR = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN';
const LOCAL_STATE_PATH = path.join(TRAE_DATA_DIR, 'Local State');
const STORAGE_PATH = path.join(TRAE_DATA_DIR, 'User', 'globalStorage', 'storage.json');

// 提取 AES key
const localState = JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, 'utf8'));
const encryptedKeyBuf = Buffer.from(localState.os_crypt.encrypted_key, 'base64');
const dpapiEncrypted = encryptedKeyBuf.slice(5);

const tempEnc = path.join(process.env.TEMP || 'C:\\Temp', 'trae-key.enc');
const tempDec = tempEnc + '.dec';
fs.writeFileSync(tempEnc, dpapiEncrypted);
const psScript = `Add-Type -AssemblyName System.Security; $bytes = [System.IO.File]::ReadAllBytes('${tempEnc}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.IO.File]::WriteAllBytes('${tempDec}', $decrypted); Write-Output $decrypted.Length`;
execSync(`powershell -NoProfile -Command "${psScript}"`, { encoding: 'utf8', timeout: 15000 });
const aesKey = fs.readFileSync(tempDec);
console.log('AES Key:', aesKey.toString('hex'));
try { fs.unlinkSync(tempEnc); fs.unlinkSync(tempDec); } catch(e) {}

const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));

// 测试值
const testValue = storage['iCubeAuthInfo://usertag'];
const decoded = Buffer.from(testValue, 'base64');

console.log('\n=== iCubeAuthInfo://usertag ===');
console.log('解码后长度:', decoded.length);
console.log('前缀 (hex):', decoded.slice(0, 4).toString('hex'));
console.log('全部 (hex):', decoded.toString('hex'));

// 尝试1: 4字节前缀 + 12字节nonce + 密文 + 16字节tag (标准GCM)
console.log('\n--- 尝试1: 4字节前缀 + nonce(12) + ciphertext + tag(16) ---');
tryDecrypt(4, 12, 16, 'end');

// 尝试2: 4字节前缀 + 12字节nonce + 16字节tag + 密文 (tag在前面)
console.log('\n--- 尝试2: 4字节前缀 + nonce(12) + tag(16) + ciphertext ---');
tryDecrypt(4, 12, 16, 'beginning');

// 尝试3: 3字节前缀 + 12字节nonce + 密文 + 16字节tag
console.log('\n--- 尝试3: 3字节前缀 + nonce(12) + ciphertext + tag(16) ---');
tryDecrypt(3, 12, 16, 'end');

// 尝试4: 无前缀 + 12字节nonce + 密文 + 16字节tag
console.log('\n--- 尝试4: 无前缀 + nonce(12) + ciphertext + tag(16) ---');
tryDecrypt(0, 12, 16, 'end');

// 尝试5: DPAPI 直接解密 (去掉4字节前缀)
console.log('\n--- 尝试5: DPAPI 直接解密 (去掉4字节前缀) ---');
tryDpapi(decoded.slice(4));

// 尝试6: DPAPI 直接解密 (完整数据)
console.log('\n--- 尝试6: DPAPI 直接解密 (完整数据) ---');
tryDpapi(decoded);

// 尝试7: v10 前缀方式 (用 "v10" 替换前4字节)
console.log('\n--- 尝试7: 替换前4字节为 v10 + nonce(12) + ciphertext + tag(16) ---');
const v10Data = Buffer.concat([Buffer.from('v10'), decoded.slice(4)]);
tryDecryptV10(v10Data);

function tryDecrypt(prefixLen, nonceLen, tagLen, tagPos) {
  const remaining = decoded.slice(prefixLen);
  if (remaining.length < nonceLen + tagLen) {
    console.log('  数据太短');
    return;
  }
  
  const nonce = remaining.slice(0, nonceLen);
  let tag, ciphertext;
  if (tagPos === 'end') {
    tag = remaining.slice(-tagLen);
    ciphertext = remaining.slice(nonceLen, -tagLen);
  } else {
    tag = remaining.slice(nonceLen, nonceLen + tagLen);
    ciphertext = remaining.slice(nonceLen + tagLen);
  }
  
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    console.log('  ✅ 解密成功!:', decrypted.substring(0, 200));
  } catch (e) {
    console.log('  ❌ 失败:', e.message.substring(0, 50));
  }
}

function tryDecryptV10(buf) {
  if (buf.length < 3 + 12 + 16) return;
  const nonce = buf.slice(3, 15);
  const tag = buf.slice(-16);
  const ciphertext = buf.slice(15, -16);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    console.log('  ✅ 解密成功!:', decrypted.substring(0, 200));
  } catch (e) {
    console.log('  ❌ 失败:', e.message.substring(0, 50));
  }
}

function tryDpapi(buf) {
  const tempEnc2 = path.join(process.env.TEMP || 'C:\\Temp', 'trae-val.enc');
  const tempDec2 = tempEnc2 + '.dec';
  fs.writeFileSync(tempEnc2, buf);
  const psScript2 = `Add-Type -AssemblyName System.Security; $bytes = [System.IO.File]::ReadAllBytes('${tempEnc2}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.IO.File]::WriteAllBytes('${tempDec2}', $decrypted); Write-Output $decrypted.Length`;
  try {
    const result = execSync(`powershell -NoProfile -Command "${psScript2}"`, { encoding: 'utf8', timeout: 15000 });
    const len = parseInt(result.trim());
    if (len > 0) {
      const decValue = fs.readFileSync(tempDec2);
      console.log('  ✅ DPAPI 解密成功! 长度:', len);
      console.log('  明文:', decValue.toString('utf8').substring(0, 200));
    } else {
      console.log('  ❌ DPAPI 返回空');
    }
  } catch (e) {
    console.log('  ❌ DPAPI 失败:', e.message.substring(0, 80));
  }
  try { fs.unlinkSync(tempEnc2); fs.unlinkSync(tempDec2); } catch(e) {}
}

// 最后总结
console.log('\n\n=== 总结 ===');
console.log('明文 key (iCubeAuthInfo://icube-dc:<tenantId>) 格式:');
const plaintextValue = storage['iCubeAuthInfo://icube-dc:7o2d894p7dr0o4'];
const plaintextJson = JSON.parse(Buffer.from(plaintextValue, 'base64').toString('utf8'));
console.log(JSON.stringify(plaintextJson, null, 2));
console.log('\n我们可以用 API 返回的数据构造此格式！');
console.log('token: 从 GetUserToken API 获取');
console.log('userId: 从 GetUserInfo/GetUserToken API 获取');
console.log('tenantId: 用作 key 的一部分');
console.log('expiredAt: 从 JWT 的 exp 字段获取 (Unix 秒)');
