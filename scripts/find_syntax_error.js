const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'features', 'backToBackTool.js');
const s = fs.readFileSync(file, 'utf8');
function test(src) {
  try {
    new Function(src);
    return null;
  } catch (e) {
    return e.message;
  }
}
let low = 0, high = s.length, lastMsg = null;
while (low < high) {
  const mid = Math.floor((low + high) / 2);
  const msg = test(s.slice(0, mid));
  if (msg) {
    lastMsg = msg;
    high = mid;
  } else {
    low = mid + 1;
  }
}
console.log('pos', low, 'message', lastMsg);
// Print context
const start = Math.max(0, low - 60);
const end = Math.min(s.length, low + 60);
console.log('context:\n' + s.slice(start, end).replace(/\n/g, '\n'));
