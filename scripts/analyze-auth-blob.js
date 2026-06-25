const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Sample auth blobs from storage.json
const blobs = {
  "usertag": "dGMFEAAAjC2WM0yt8z+dNeMQbabKNBoAsAB/6YDNwnsmr81pCnT8sGVlTIpZqYRoxGqojKIeEP4p0O3bbyYNs0bV1Ua6cx7VOsVRWhU16UJxIKBUyKMFzcn99T2tAZmpPLvXGoxreg97xON0pzLLVos0ZLYEoAlztrW9Fst386m1JkwtWFGs+6Qk2+Xcxv+PlUj9J715",
  "icube-dc:1124132644771876": "dGMFEAAAhoQjtT9K2K/rfBmLsHqGT7BQgvKcDhU/1OaT/M21YksC051qH/OcXmPLqLH2AOhPvQT11tsE337CYeA4RFvZUD/PlofXxA2Cc51gjVCxE/2MOkuMhDrB47PB8jLxhd1t5dAb0LPUX+8q/n7/xCES/ax9RCjyNk/c9UfT6opT/vJApG8FvnYkM8QZErBd5Nohf5OAOqY/36fsj645U/9UGI65+4CPVkekiVxAbuQsJ4JK3Eq2+OYpgghhv84QV7U3nogQTzGXJ7NcZRwcqidI85VIVqVGPAi1jssJIKxZtZYwr/HPx2zhSLLhp1jtmVZsWGdZwAkxGOWBNw9qJzZEI37oLlyj2cgh/bxIzlee2lT5rQfdDTzPgg8s6NJ0+RV0qglsklvBvpFZgtnU2ttA8gcyx5FH1vKijnso+M6nPi8a4L1dlhuSaJ0YRNilQNOCBiQ9C1ohMpYI8fqtOHPPiB4/WqMis3V4aaQ1iUsyt9GoWB30TgDmEQ9WB3RB+ZEKxwcnc+4fGl5p839sFr3tq8CWgG/3uUL286JIPSvM/REUerSx7f+lw/XhAKdH8010BEp+9Cz9wBiPmJj2EEC+CZUoXxEgFf9RknTiRV3bYEPTG7MkaAik7AgWglDy8buvu28up0ieqFhpXq6VTLIc8Csd7yGKKEVUToovTs/M9nVE9qAcKXCVUzlSVtI477wqAZJz1aSXnqTuywW9+BSXWTRYQ+7C2+CJivPxSEK1NHxNUpZc7ht996AdINOj/UH/",
  "icube.cloudide": "dGMFEAAAyTqqdhTkpypfYAEePLlU7KKYFVvCqBVfzZdcgcLNMhmk4cRxchakqm2PYq8ZRXLRtbSZjRvUFV+WNxDqGDyGeecNRAUVLBBvVv5FPJ+zB1epQ7l4oQsuf6F6U8kX4XYPilc40g2f88s3cutDzwhSTdoB0v9dHLRrwF3qDUd1l7Ftk8yNSZf6BMJbfbV4ULrraKpGmROslrJ3gyMhmSx0Bx2Z/SxhtGREuphe+xjhpBxgy33ANmIiwZ4J6CTnUmvbeH+Xxftq/YFqH/0sMcI4ZcYyMzADIEuxBJJp8g2bKg36VL7Umyo9J+rMwV3EJftCT8SPkL/VkKvKqskwWOdBkZr47lJY5S/e8HzyM2V+3Z7FR5t+HLPuGSPZLhc9WwAAFZGjePf11HHUYxoDOjp11rul8Jc/zHljQlYD7X6SsXNa6mDtvorC1lQw3I5xmJvbkGIBteFMqFgW0+kRkpW32evHG2VCd1eaqM1nSyh259u0LbSQDLOan6kxHVNpkSgt3M9BzCNRAbjAyr31U3qnolUUc8ru/A1SfHSCKbxGBmVOyWurr1GEP+Inyp9iI0eiXKx9b9UsU+Z3yGnGja+BWpT7whOefhI0In/lxxEy8GO3pP9Fe+Ubo+pWyYe9d/nNxCOps5BNSQmIdVps+/S/N0Dzp1NKJRl3tlL74Nh9tM6aMz2leRqxLDdjbJZqlrRyNAfvdeBj0eYrqal6EUE+9rgOsdkHe9hVU1HBlalUL47acN+GcMflZXPGykxk4RXH9FPOaNBoO1LLRcvv7a6cg8MppddTOD78RQ7m4CVMkb1ejyC/djZaEkhru92QfAaRcfArvuaCF/xDVikgSFv4UWRoj4j8q9Cfr6A1OcKk+ec5W0jB6W4d4yXP+NuoalRsxAm5BgCws8jEhMIdujmwSim89TdNXvh3s5FhTK5xa/vzRfNCbCA52M/GWuKnm+WDA+G+gWLxMSQn7uuIxhGGaBo7OHEO0BOlpott8zEnjY4eyniRY7MyLojmk6cpcnocgsQtTxec7QV37/NlIKuaNxjC4Pynb3QvHpiXljc7973EZBWjRtXt64BuDQt7w43bSLzvdidp+2+3PL8hoy6tblm8zUpYDRg+23vaec7iXKpFeWMLTpKiBuCVc93CbGNLo9xI+wHU3cGB+P4FsrwK66XtZzNGloxPtGx38tbowiQ6/NyujQJ8gw71qISRL0cFyY+Kgsk/f5GHcBQIshn8416zWA9RwxcPiN5pQKYWMji9k6/oF+PycM57mqjv/4vDu0A9YU/gKcEsmwYtyufazD74p6wjfxB4LTLDfeu/9/ptnZMjWhk1+DsIy7Ev3pVipPf/qJCNwCkDGl+AjBrh3KhwXdt6/e6QNlx2i9mYSHKII46I6K6V2c9+WOgmWq86+u6hGeP7qBq3cHo2U8u7ot2rqgHarjca7aQTWCYQyxiVce15frWGOuPGJs8dgTdipo5aRpB+vWiXjBRfHf7MfYNymeNR+eW01hlTLcuCoeIfDa+hy5NhbugCeiF09YtISXufVZOkcMbIwdqbJYU0JtLPJd1ifASdrXm6X2vpcVHlfT56JbLzUI9FnTn8w6l5xEb8rLhZ9s7AY72HfnCLdb4JvX19XmZrUfiFI96GAoqjve9FZKaOpJ3sHOJjTTximIGM0RtWagIb+3B2Abz7Uf/t+PFnISsnPZPtn9HlnV4Ma1VT0Z2ofT7atV3ZmjQgxGpMOEJ73Kga0EGOeA3XkcQ77F5apsIe3EZFqj8eM6dXkMoPcnDElgTrhNxa2J/TZc2Z+ajpx/SkxGKUHxX4RplSru5WxugMyMK5w+pAP77+hHxpJ5ZecUC3JgVBXxiKJX1QulqmtC0MJMQ6QLVvuPXV9bJV0rWPsX8xJSZyX7ZreORx3rIPBKcweyHNsN9gv/uf79+WoO1qLTlPMD4OkPlEE8C4+R+qBs3Ds0XxVxyMpcq4D19neivcCAW5DKw1bKRPpBBbBwUrCkmyDp0Vwoyb/GAYlb6M1Pf+26eE2lkrH9gT1f53neyLhlVr0cbM3hytBQwnDx9mdM5YPtDo70yki+it7sn8A7MlqMeJHNgNSGjczmqBYmh/yBdefCy/ziMIEkmrUY64u+JnSU/pO/CKs03ItVBcUXgeA+ySMnLW7J+Qab11KLPMJU5vFJg9EFdx8tkrV2FLE7K+iccOTTGv3S9Lv98TJ4SF7w0NOCTySSLJd7L8N+MlaKGrnMcvBUzsN0DZspWUT+Amu5/Qj3C8PqWQ0cETq28C+8QOhR/+PoagR4VZK8w8OnTNrxS5qLvsZWU6zobmPwqnlsYTlNMsXWiZazsZbXEutRx2fk4AJjqNobmyK7IBbFAvOueVqamhm+u+Q4b8uDiT2tmr9kzmeyOrxo0hLElQ9odjRPBRq7WLfvEhEnmsLCer4U3kP2v0SVoUmQzM6a7yk1rh7eXE+2gYQijeFB4GIEXs3CU="
};

function analyzeBlob(name, base64Str) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Analyzing: iCubeAuthInfo://${name}`);
  console.log(`${'='.repeat(60)}`);
  
  // Remove potential padding issues
  const padded = base64Str + '=='.slice(0, (4 - base64Str.length % 4) % 4);
  
  try {
    const buf = Buffer.from(padded, 'base64');
    console.log(`\n[Size] ${buf.length} bytes (${buf.length - 4} bytes after header)`);
    
    // Show first 32 bytes as hex
    console.log(`\n[First 32 bytes as hex]:`);
    console.log(buf.slice(0, 32).toString('hex').match(/.{2}/g).join(' '));
    
    // Try to interpret first bytes
    console.log(`\n[Header analysis]:`);
    console.log(`  Bytes 0-3 (header): ${buf.slice(0, 4).toString('utf8', 0, 4)}`);
    console.log(`  Byte 4 (version?): 0x${buf[4].toString(16).padStart(2, '0')} (${buf[4]})`);
    console.log(`  Bytes 5-8: ${buf.slice(5, 9).toString('hex')}`);
    
    // Check if it could be AES encrypted (16-byte block aligned)
    console.log(`\n[Encryption analysis]:`);
    console.log(`  Size mod 16: ${buf.length % 16}`);
    console.log(`  Size mod 8: ${buf.length % 8}`);
    
    // Look for any printable strings
    console.log(`\n[Printable ASCII strings]:`);
    const str = buf.toString('utf8');
    const readable = str.match(/[\x20-\x7e]{4,}/g);
    if (readable) {
      readable.slice(0, 10).forEach(s => console.log(`  "${s}"`));
    } else {
      console.log(`  (none found)`);
    }
    
    // Check magic bytes
    console.log(`\n[Magic bytes check]:`);
    const magic = buf.slice(0, 4);
    console.log(`  0x74634645 = "tcFE"? Actually: ${magic.toString('utf8')}`);
    console.log(`  As uint32 LE: ${buf.readUInt32LE(0)}`);
    console.log(`  As uint32 BE: ${buf.readUInt32BE(0)}`);
    
  } catch (e) {
    console.error(`Error analyzing ${name}:`, e.message);
  }
}

// Analyze all blobs
Object.entries(blobs).forEach(([name, blob]) => {
  analyzeBlob(name, blob);
});

// Also try to read actual storage.json if available
const storagePath = path.join(
  process.env.APPDATA || '',
  'Trae CN',
  'User',
  'globalStorage',
  'storage.json'
);

console.log(`\n${'='.repeat(60)}`);
console.log(`Checking actual storage.json at: ${storagePath}`);
console.log(`${'='.repeat(60)}`);

try {
  if (fs.existsSync(storagePath)) {
    const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    const authKeys = Object.keys(storage).filter(k => k.startsWith('iCubeAuthInfo://'));
    
    console.log(`\nFound ${authKeys.length} iCubeAuthInfo keys:`);
    authKeys.forEach(key => {
      const value = storage[key];
      console.log(`\n- ${key}:`);
      console.log(`  Length: ${value.length} chars (Base64)`);
      try {
        const buf = Buffer.from(value, 'base64');
        console.log(`  Decoded size: ${buf.length} bytes`);
        console.log(`  Header: ${buf.slice(0, 4).toString('utf8')}`);
        console.log(`  Hex prefix: ${buf.slice(0, 16).toString('hex')}`);
      } catch (e) {
        console.log(`  Error decoding: ${e.message}`);
      }
    });
  } else {
    console.log('\nstorage.json not found (this is expected if not on Windows with Trae CN installed)');
  }
} catch (e) {
  console.error('Error reading storage.json:', e.message);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Possible decryption approaches:`);
console.log(`${'='.repeat(60)}`);
console.log(`
1. Electron safeStorage.decryptString() - Trae CN might use this
2. Node.js crypto with derived key (machine-specific)
3. Hardcoded key in Trae CN's main bundle
4. WebCrypto API with embedded key

To decrypt, we need to:
- Find the encryption key in Trae CN's source code
- Or use Electron's safeStorage APIs if key is derived from OS keychain
`);
