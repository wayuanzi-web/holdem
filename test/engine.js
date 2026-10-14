/* 在 Node 裡載入引擎：把 src/engine/*.js（不含 90-worker）串起來，回傳裡面所有的頂層名稱 */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src', 'engine');
function engineSource() {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('90-')).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}
function load() {
  const src = engineSource();
  const names = new Set();
  for (const m of src.matchAll(/^(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^(?:const|let)\s+(.*)$/gm)) {                 // const A = …, B = …;
    for (const x of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=(?!=)/g)) names.add(x[1]);
  }
  const body = src + '\nreturn {' + [...names].join(',') + '};';
  return new Function(body)();
}
module.exports = load();
module.exports.engineSource = engineSource;
