// scripts/decode-auth-plaintext.js
// 分析 iCubeAuthInfo 的明文格式

const fs = require('fs');
const path = require('path');

const TRAE_DATA_DIR = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN';
const STORAGE_PATH = path.join(TRAE_DATA_DIR, 'User', 'globalStorage', 'storage.json');

const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
const authKeys = Object.keys(storage).filter(k => k.startsWith('iCubeAuthInfo://'));

console.log('=== iCubeAuthInfo 明文分析 ===\n');

for (const key of authKeys) {
  const value = storage[key];
  console.log('---', key, '---');
  console.log('值前30字符:', value.substring(0, 30));
  console.log('值长度:', value.length);

  // 尝试 Base64 解码
  const decoded = Buffer.from(value, 'base64');
  const decodedStr = decoded.toString('utf8');
  
  // 检查是否是 JSON
  if (decodedStr.startsWith('{') || decodedStr.startsWith('[')) {
    console.log('✅ 是 Base64 编码的明文 JSON!');
    try {
      const json = JSON.parse(decodedStr);
      console.log('JSON keys:', Object.keys(json));
      console.log('完整内容:', JSON.stringify(json, null, 2).substring(0, 2000));
    } catch (e) {
      console.log('JSON 解析失败，前500字符:', decodedStr.substring(0, 500));
    }
  } else {
    console.log('❌ 不是明文 JSON');
    console.log('解码后前20字节 (hex):', decoded.slice(0, 20).toString('hex'));
    console.log('可能是加密数据');
  }
  console.log('');
}

// 也检查 iCubeServerData
const serverDataKeys = Object.keys(storage).filter(k => k.startsWith('iCubeServerData://'));
for (const key of serverDataKeys) {
  const value = storage[key];
  console.log('---', key, '---');
  console.log('值前30字符:', value.substring(0, 30));
  console.log('值长度:', value.length);
  
  // 尝试直接 JSON.parse
  try {
    const json = JSON.parse(value);
    console.log('✅ 直接是 JSON!');
    console.log('内容:', JSON.stringify(json, null, 2).substring(0, 1000));
  } catch (e) {
    // 尝试 Base64
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      const json = JSON.parse(decoded);
      console.log('✅ Base64 编码的 JSON!');
      console.log('内容:', JSON.stringify(json, null, 2).substring(0, 1000));
    } catch (e2) {
      console.log('不是 JSON');
    }
  }
  console.log('');
}
