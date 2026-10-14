/* 跟 treys 比大小：同樣的 7 張牌，我們的值越大、treys 的排名要越小；值一樣、排名也要一樣 */
const E = require('./engine'), fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const map = new Map();
let bad = 0;
for (const ln of lines) {
  const a = ln.split(' ').map(Number), v = E.evalCards(a.slice(0, 7), 7), t = a[7];
  if (map.has(v) && map.get(v) !== t) bad++;
  map.set(v, t);
}
const keys = [...map.keys()].sort((x, y) => x - y);
for (let i = 1; i < keys.length; i++) if (!(map.get(keys[i]) < map.get(keys[i - 1]))) bad++;
console.log(lines.length, '手，', keys.length, '種不同的值，不一致', bad, bad ? '錯' : 'OK');
process.exit(bad ? 1 : 0);
