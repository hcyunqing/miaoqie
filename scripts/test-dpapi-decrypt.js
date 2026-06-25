// scripts/test-dpapi-decrypt.js
// 测试能否用 DPAPI 解密 Trae CN 的 Local State 中的 AES 密钥
// 并尝试解密 iCubeAuthInfo 数据

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const TRAE_DATA_DIR = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN';
const LOCAL_STATE_PATH = path.join(TRAE_DATA_DIR, 'Local State');
const STORAGE_PATH = path.join(TRAE_DATA_DIR, 'User', 'globalStorage', 'storage.json');

console.log('=== Trae CN 加密分析 ===\n');

// 1. 读取 Local State 中的 encrypted_key
const localState = JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, 'utf8'));
const encryptedKeyB64 = localState.os_crypt.encrypted_key;
console.log('1. Local State encrypted_key (前50字符):', encryptedKeyB64.substring(0, 50));

const encryptedKeyBuf = Buffer.from(encryptedKeyB64, 'base64');
console.log('   解码后长度:', encryptedKeyBuf.length);

const prefix = encryptedKeyBuf.slice(0, 5).toString('ascii');
console.log('   前缀:', JSON.stringify(prefix));

if (prefix === 'DPAPI') {
  console.log('   ✅ 确认是 Chromium OSCrypt 格式 (DPAPI 前缀)\n');

  // 去掉 DPAPI 前缀 (5字节)
  const dpapiEncrypted = encryptedKeyBuf.slice(5);
  console.log('   DPAPI 加密数据长度:', dpapiEncrypted.length);

  // 写入临时文件
  const tempEnc = path.join(process.env.TEMP || 'C:\\Temp', 'trae-dpapi-key.enc');
  const tempDec = tempEnc + '.dec';
  fs.writeFileSync(tempEnc, dpapiEncrypted);

  // 使用 PowerShell 调用 DPAPI 解密（需要先加载 System.Security 程序集）
  const psScript = `Add-Type -AssemblyName System.Security; $bytes = [System.IO.File]::ReadAllBytes('${tempEnc}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.IO.File]::WriteAllBytes('${tempDec}', $decrypted); Write-Output $decrypted.Length`;

  try {
    const result = execSync(`powershell -NoProfile -Command "${psScript}"`, { encoding: 'utf8', timeout: 15000 });
    const aesKeyLen = parseInt(result.trim());
    console.log('   DPAPI 解密成功! AES 密钥长度:', aesKeyLen);

    if (aesKeyLen === 0) throw new Error('AES key is empty');

    const aesKey = fs.readFileSync(tempDec);
    console.log('   AES 密钥 (hex):', aesKey.toString('hex'));
    console.log('   AES 密钥长度:', aesKey.length, 'bytes\n');

    // 2. 读取 storage.json 中的 iCubeAuthInfo 值
    const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
    const authKeys = Object.keys(storage).filter(k => k.startsWith('iCubeAuthInfo://'));
    console.log('2. storage.json 中的 iCubeAuthInfo 键:', authKeys);

    // 取一个值分析
    const testKey = authKeys[0];
    const testValue = storage[testKey];
    console.log('\n   测试键:', testKey);
    console.log('   值 (前50字符):', testValue.substring(0, 50));
    console.log('   值长度:', testValue.length);

    // 尝试 Base64 解码
    const decoded = Buffer.from(testValue, 'base64');
    console.log('\n   Base64 解码后长度:', decoded.length);
    console.log('   前20字节 (hex):', decoded.slice(0, 20).toString('hex'));
    console.log('   前3字节 (ascii):', JSON.stringify(decoded.slice(0, 3).toString('ascii')));

    // 尝试 v10 格式解密
    if (decoded.slice(0, 3).toString('ascii') === 'v10') {
      console.log('\n3. ✅ 检测到 v10 前缀，尝试 AES-256-GCM 解密...');
      tryAesGcmDecrypt(aesKey, decoded, testKey);
    } else {
      console.log('\n3. ⚠️ 不是 v10 前缀，尝试其他方法...');

      // 尝试直接 DPAPI 解密
      console.log('   尝试直接 DPAPI 解密...');
      const tempEnc2 = path.join(process.env.TEMP || 'C:\\Temp', 'trae-auth-value.enc');
      const tempDec2 = tempEnc2 + '.dec';
      fs.writeFileSync(tempEnc2, decoded);
      const psScript2 = `Add-Type -AssemblyName System.Security; $bytes = [System.IO.File]::ReadAllBytes('${tempEnc2}'); $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.IO.File]::WriteAllBytes('${tempDec2}', $decrypted); Write-Output $decrypted.Length`;
      try {
        const result2 = execSync(`powershell -NoProfile -Command "${psScript2}"`, { encoding: 'utf8', timeout: 15000 });
        console.log('   DPAPI 直接解密成功! 长度:', result2.trim());
        const decValue = fs.readFileSync(tempDec2);
        console.log('   明文:', decValue.toString('utf8').substring(0, 500));
        try { fs.unlinkSync(tempEnc2); fs.unlinkSync(tempDec2); } catch(e) {}
      } catch (e2) {
        console.log('   DPAPI 直接解密失败');
        try { fs.unlinkSync(tempEnc2); fs.unlinkSync(tempDec2); } catch(e) {}

        // 尝试 JSON 格式
        console.log('\n   尝试解析为 JSON...');
        try {
          const parsed = JSON.parse(testValue);
          console.log('   JSON 解析成功! keys:', Object.keys(parsed));
          if (parsed.data && Array.isArray(parsed.data)) {
            console.log('   data 数组长度:', parsed.data.length);
            const buf = Buffer.from(parsed.data);
            console.log('   Buffer 前20字节 (hex):', buf.slice(0, 20).toString('hex'));

            // 检查是否是 v10
            if (buf.slice(0, 3).toString('ascii') === 'v10') {
              console.log('   ✅ JSON 内部是 v10 格式!');
              tryAesGcmDecrypt(aesKey, buf, testKey + ' (from JSON)');
            } else {
              console.log('   Buffer 前3字节:', buf.slice(0, 3).toString('hex'));
              // 也许直接是密文
              console.log('   尝试直接 AES-GCM (假设无前缀，nonce=前12字节)...');
              tryAesGcmRaw(aesKey, buf, testKey);
            }
          }
        } catch (e3) {
          console.log('   不是 JSON 格式:', e3.message.substring(0, 100));
        }
      }
    }

    // 清理
    try { fs.unlinkSync(tempEnc); fs.unlinkSync(tempDec); } catch(e) {}

  } catch (e) {
    console.log('   ❌ DPAPI 解密失败:', e.message);
    try { fs.unlinkSync(tempEnc); fs.unlinkSync(tempDec); } catch(e2) {}
  }
}

function tryAesGcmDecrypt(aesKey, buf, label) {
  const nonce = buf.slice(3, 15);    // 12 bytes nonce (after "v10")
  const ciphertext = buf.slice(15, -16);  // ciphertext
  const tag = buf.slice(-16);        // 16 bytes tag

  console.log('   Nonce (hex):', nonce.toString('hex'));
  console.log('   Ciphertext 长度:', ciphertext.length);
  console.log('   Tag (hex):', tag.toString('hex'));

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    console.log('\n   🎉 AES-256-GCM 解密成功!');
    console.log('   明文:', decrypted.substring(0, 500));
    if (decrypted.length > 500) console.log('   ... (共', decrypted.length, '字符)');
  } catch (e) {
    console.log('   ❌ AES-256-GCM 解密失败:', e.message);
  }
}

function tryAesGcmRaw(aesKey, buf, label) {
  // 假设格式: nonce(12) + ciphertext + tag(16)
  if (buf.length < 28) {
    console.log('   数据太短，无法解密');
    return;
  }
  const nonce = buf.slice(0, 12);
  const tag = buf.slice(-16);
  const ciphertext = buf.slice(12, -16);

  console.log('   Nonce (hex):', nonce.toString('hex'));
  console.log('   Ciphertext 长度:', ciphertext.length);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, null, 'utf8');
    decrypted += decipher.final('utf8');
    console.log('\n   🎉 原始 AES-256-GCM 解密成功!');
    console.log('   明文:', decrypted.substring(0, 500));
  } catch (e) {
    console.log('   ❌ 原始 AES-256-GCM 解密失败:', e.message);
  }
}
