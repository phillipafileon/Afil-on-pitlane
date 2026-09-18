const fs = require('fs');
for (const file of ['runtime_discount_booking_patch.cjs','runtime_discount_shop_patch.cjs']) {
  let s = fs.readFileSync(file,'utf8');
  s = s.replace(/\$\{/g,'\\$'+'{');
  fs.writeFileSync(file,s);
  console.log('Escaped template interpolation in '+file);
}
