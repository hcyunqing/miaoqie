// scripts/trae-crypto.js
// Trae CN 的自定义加密/解密算法（从 main.js 逆向）
// 用于加密 iCubeAuthInfo://icube.cloudide 的值

const crypto = require('crypto');

// 常量
const AES128 = 16;      // AES-128 密钥长度
const IV_LEN = 16;       // CBC IV 长度 (CD = bD = 16)
const HASH_LEN = 64;     // SHA-512 hash 长度 (Od)
const SALT_LEN = 32;     // 随机盐长度 (P2)
const SALT_HASH_LEN = 64; // ED = 64
const HEADER_LEN = 6;    // Uf = 6

// 版本头字节: kD=116('t'), TD=99('c'), ID=5, DD=16, AD=0, PD=0
const VERSION_BYTES = [116, 99, 5, 16, 0, 0]; // "tc\x05\x10\x00\x00"

// XOR 密钥对 (AES 模式使用 pX ^ fX)
const pX = Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const fX = Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);

// SHA-512 hash
function SHA512(data) {
  return crypto.createHash('sha512').update(Buffer.from(data)).digest();
}

// XOR 密钥派生
function deriveXorKey(len, mode = 'AES') {
  const result = new Uint8Array(len);
  if (mode === 'AES') {
    for (let i = 0; i < len; i++) result[i] = pX[i] ^ fX[i];
  }
  return result;
}

// 从随机盐派生 AES key 和 IV
async function deriveKeyIv(salt, keyLen = AES128, ivLen = IV_LEN, mode = 'AES') {
  // s = new Uint8Array(Od + ED) = 64 + 64 = 128 bytes
  const s = new Uint8Array(HASH_LEN + SALT_HASH_LEN);
  
  // s.set(SHA512(salt), 0)
  const saltHash = SHA512(salt);
  s.set(saltHash, 0);
  
  // s.set(xorKey, Od)
  const xorKey = deriveXorKey(SALT_HASH_LEN, mode);
  s.set(xorKey, HASH_LEN);
  
  // c = SHA512(s)
  const c = SHA512(s);
  s.set(c, 0);
  
  // aesKey = s.slice(0, keyLen)
  // iv = s.slice(keyLen, keyLen + ivLen)
  const aesKey = s.slice(0, keyLen);
  const iv = s.slice(keyLen, keyLen + ivLen);
  
  return { aesKey: Buffer.from(aesKey), iv: Buffer.from(iv) };
}

// AES-128-CBC 加密
async function aesEncrypt(key, iv, data) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

// AES-128-CBC 解密
async function aesDecrypt(key, iv, data) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * 加密数据（对应 Pke 函数）
 * 输入: 明文字符串
 * 输出: Buffer (版本头 + 随机盐 + 加密数据)
 */
async function encrypt(plaintext) {
  const plaintextBytes = Buffer.from(plaintext, 'utf8');
  
  // 生成随机盐 (32 bytes)
  const salt = crypto.randomBytes(SALT_LEN);
  
  // 派生 AES key 和 IV
  const { aesKey, iv } = await deriveKeyIv(salt);
  
  // 构造 payload: SHA512(plaintext) + plaintext  (64 + plaintext.length)
  const hash = SHA512(plaintextBytes);
  const payload = Buffer.alloc(HASH_LEN + plaintextBytes.length);
  payload.set(hash, 0);
  payload.set(plaintextBytes, HASH_LEN);
  
  // AES-128-CBC 加密
  const encrypted = await aesEncrypt(aesKey, iv, payload);
  
  // 构造版本头: VERSION_BYTES + salt (6 + 32 = 38 bytes)
  const header = Buffer.alloc(HEADER_LEN + SALT_LEN);
  for (let i = 0; i < HEADER_LEN; i++) header[i] = VERSION_BYTES[i];
  header.set(salt, HEADER_LEN);
  
  // 最终输出: header + encrypted
  return Buffer.concat([header, encrypted]);
}

/**
 * 解密数据（对应 Tke 函数）
 * 输入: Buffer (版本头 + 随机盐 + 加密数据)
 * 输出: 明文字符串
 */
async function decrypt(ciphertext) {
  // 提取版本头 (前6字节)
  const version = ciphertext.slice(0, HEADER_LEN);
  console.log('Version bytes:', Array.from(version));
  
  // 提取随机盐 (接下来32字节)
  const salt = ciphertext.slice(HEADER_LEN, HEADER_LEN + SALT_LEN);
  
  // 派生 AES key 和 IV
  const { aesKey, iv } = await deriveKeyIv(salt);
  
  // 解密
  const decrypted = await aesDecrypt(aesKey, iv, ciphertext.slice(HEADER_LEN + SALT_LEN));
  
  // 验证 hash
  const storedHash = decrypted.slice(0, HASH_LEN);
  const actualData = decrypted.slice(HASH_LEN);
  const computedHash = SHA512(actualData);
  
  if (!storedHash.equals(computedHash)) {
    throw new Error('Hash verification failed — decryption produced invalid data');
  }
  
  return actualData.toString('utf8');
}

/**
 * Base64 编码（对应 Bf 函数）
 */
async function encryptToBase64(plaintext) {
  const encrypted = await encrypt(plaintext);
  return encrypted.toString('base64');
}

/**
 * Base64 解码 + 解密（对应 R2 函数）
 */
async function decryptFromBase64(b64string) {
  const ciphertext = Buffer.from(b64string, 'base64');
  return await decrypt(ciphertext);
}

module.exports = {
  encrypt,
  decrypt,
  encryptToBase64,
  decryptFromBase64,
};

// 测试
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  
  (async () => {
    console.log('=== Trae CN Crypto Test ===\n');
    
    // 测试1: 加密再解密
    const testText = '{"userId":"123","account":{"scope":"test"}}';
    console.log('原文:', testText);
    const encrypted = await encryptToBase64(testText);
    console.log('加密后 (前50字符):', encrypted.substring(0, 50));
    console.log('加密后长度:', encrypted.length);
    const decrypted = await decryptFromBase64(encrypted);
    console.log('解密后:', decrypted);
    console.log('解密匹配:', decrypted === testText ? '✅' : '❌');
    
    // 测试2: 解密实际的 storage.json 数据
    const STORAGE_PATH = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN\\User\\globalStorage\\storage.json';
    const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
    
    console.log('\n=== 解密 storage.json 中的加密值 ===\n');
    
    const encryptedKeys = [
      'iCubeAuthInfo://usertag',
      'iCubeAuthInfo://icube-dc:1124132644771876',
      'iCubeAuthInfo://icube.cloudide',
    ];
    
    for (const key of encryptedKeys) {
      if (!storage[key]) continue;
      console.log('---', key, '---');
      try {
        const plaintext = await decryptFromBase64(storage[key]);
        console.log('解密成功!');
        console.log('明文 (前500字符):', plaintext.substring(0, 500));
        if (plaintext.length > 500) console.log('...(共', plaintext.length, '字符)');
      } catch (e) {
        console.log('解密失败:', e.message);
      }
      console.log('');
    }
  })();
}
