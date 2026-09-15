const fs = require('fs');
const path = 'runtime_printful_shop_patch.cjs';
let s = fs.readFileSync(path, 'utf8');
s = s.replace('${API_PUBLIC_URL}', '\\${API_PUBLIC_URL}');
fs.writeFileSync(path, s);
console.log('Prepared Printful webhook runtime patch');
