const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'features', 'backToBackTool.js');
const src = fs.readFileSync(file,'utf8');
let depth=0;
for(let i=0;i<src.length;i++){ const ch=src[i]; if(ch==='"'||ch==="'"||ch==='`'){ // skip strings
  const quote=ch; i++; while(i<src.length){ if(src[i]==='\\') i+=2; else if(src[i]===quote) break; else i++; } continue; }
 if(ch==='\'{') depth++; if(ch==='}') { depth--; if(depth<0){ console.log('negative at', i); const start=Math.max(0,i-60); const end=Math.min(src.length,i+60); console.log(src.slice(start,end)); process.exit(0);} }
}
console.log('final depth',depth);
