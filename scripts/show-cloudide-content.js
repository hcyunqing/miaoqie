// scripts/show-cloudide-content.js
const fs = require('fs');
const { decryptFromBase64 } = require('../electron/trae-crypto');

const STORAGE_PATH = 'C:\\Users\\云卿\\AppData\\Roaming\\Trae CN\\User\\globalStorage\\storage.json';

(async () => {
  const storage = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
  const plaintext = await decryptFromBase64(storage['iCubeAuthInfo://icube.cloudide']);
  const json = JSON.parse(plaintext);
  console.log('icube.cloudide 完整内容:');
  console.log(JSON.stringify(json, null, 2));
  console.log('\n字段:', Object.keys(json));
})();
