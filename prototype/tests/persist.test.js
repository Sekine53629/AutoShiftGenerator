// シフトの中身が再読み込みで残るかを、DOM 無しで確かめる。
//
// これが無かったころは values（シフトの中身）を localStorage に一度も
// 書いておらず、再読み込みで丸ごと消えていた。しかも起動時に
// autoGenerate() が走るので作り直された表が出て、消えたことに気づけなかった。
//
//   node prototype/tests/persist.test.js
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync('prototype/ShiftGrid.html', 'utf8');

function grab(n) {
  const at = src.indexOf('function ' + n + '(');
  if (at < 0) throw new Error('見つからない: ' + n);
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); }
  }
}
const line = t => src.split(/\r?\n/).find(l => l.includes(t));

// localStorage の代わり。容量を絞ると、あふれる挙動も見られる
function makeStore(limit) {
  const data = {};
  return {
    dump: data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => {
      if (limit !== undefined && v.length > limit) {
        const e = new Error('QuotaExceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      data[k] = v;
    },
    removeItem: k => { delete data[k]; },
  };
}

function build(limit) {
  const store = makeStore(limit);
  const api = new Function('localStorage', [
    line('  const CELLS_KEY'),
    line('  let cellsPersist'),
    'const values = new Map();',
    grab('saveCells'), grab('loadCells'),
    'return { values, saveCells, loadCells,',
    '         persist: () => cellsPersist };',
  ].join('\n'))(store);
  return { api, store };
}

let fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  OK  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
};

console.log('■ シフトの中身が残るか');

ok('書いたものが読み戻せる', () => {
  const a = build();
  a.api.values.set('s001|2026-10|1', '○');
  a.api.values.set('doc1|2026-10|1', '医A');
  a.api.values.set('note|2026-10|3', '棚卸');
  assert.strictEqual(a.api.saveCells(), true);

  // 別の起動として読み直す
  const b = build();
  b.store.dump[Object.keys(a.store.dump)[0]] = a.store.dump[Object.keys(a.store.dump)[0]];
  assert.strictEqual(b.api.loadCells(), 3, '3件読めるはず');
  assert.strictEqual(b.api.values.get('s001|2026-10|1'), '○');
  assert.strictEqual(b.api.values.get('doc1|2026-10|1'), '医A');
  assert.strictEqual(b.api.values.get('note|2026-10|3'), '棚卸');
});

ok('月をまたいでも別々に残る', () => {
  const a = build();
  a.api.values.set('s001|2026-10|1', '○');
  a.api.values.set('s001|2026-11|1', '▲');
  a.api.saveCells();
  const b = build();
  Object.assign(b.store.dump, a.store.dump);
  b.api.loadCells();
  assert.strictEqual(b.api.values.get('s001|2026-10|1'), '○');
  assert.strictEqual(b.api.values.get('s001|2026-11|1'), '▲');
});

ok('空欄は書かない（消した分が復活しない）', () => {
  const a = build();
  a.api.values.set('s001|2026-10|1', '○');
  a.api.values.set('s001|2026-10|2', '');
  a.api.saveCells();
  const b = build();
  Object.assign(b.store.dump, a.store.dump);
  assert.strictEqual(b.api.loadCells(), 1);
  assert.strictEqual(b.api.values.has('s001|2026-10|2'), false);
});

ok('控えが空でも壊れない', () => {
  const a = build();
  assert.strictEqual(a.api.loadCells(), 0, '何も無ければ0件');
});

console.log('■ 壊れた控えで表を壊さない');

ok('JSON として読めない控えは捨てる', () => {
  const a = build();
  a.store.dump['shiftgrid.cells.v1'] = '{壊れている';
  assert.strictEqual(a.api.loadCells(), 0);
  assert.strictEqual(a.api.values.size, 0);
});

ok('形の違うキーは通さない', () => {
  const a = build();
  a.store.dump['shiftgrid.cells.v1'] = JSON.stringify({
    's001|2026-10|1': '○',        // 正しい
    's001|2026-10': '×',           // 日が無い
    'bad-key': '×',                // 区切りが無い
    's001|26-10|1': '×',           // 年が4桁でない
    's001|2026-10|': '×',          // 日が空
    's001|2026-10|1|2': '×',       // 余分な区切り
  });
  assert.strictEqual(a.api.loadCells(), 1, '正しい1件だけ通す');
  assert.strictEqual(a.api.values.get('s001|2026-10|1'), '○');
});

console.log('■ 保存できないときに黙らない');

ok('容量を超えたら保存失敗を返し、印を立てる', () => {
  const a = build(10);            // 10文字しか入らない
  a.api.values.set('s001|2026-10|1', '○');
  assert.strictEqual(a.api.saveCells(), false, '失敗を返す');
  assert.strictEqual(a.api.persist(), false, '保存できていない印が立つ');
});

ok('保存できなくても値はメモリに残る（作業は続けられる）', () => {
  const a = build(10);
  a.api.values.set('s001|2026-10|1', '○');
  a.api.saveCells();
  assert.strictEqual(a.api.values.get('s001|2026-10|1'), '○');
});

ok('一度失敗しても、通れば印は戻る', () => {
  const a = build(10);
  a.api.values.set('s001|2026-10|1', '○');
  a.api.saveCells();
  assert.strictEqual(a.api.persist(), false);
  a.api.values.clear();           // 中身を減らせば入る
  assert.strictEqual(a.api.saveCells(), true);
  assert.strictEqual(a.api.persist(), true);
});

console.log('■ 起動の配線');

ok('起動時に読み戻し、読めたときは自動生成しない', () => {
  // 起動部分は DOM に触るので、ソースの並びで確かめる
  const boot = src.slice(src.indexOf('/* ═══ 起動'));
  assert.ok(/const restored = loadCells\(\);/.test(boot),
    '起動時に loadCells を呼んでいない');
  assert.ok(/if \(!restored\) \{[\s\S]{0,200}autoGenerate\(\);/.test(boot),
    '読み戻せたときに autoGenerate を止めていない（作り直した表で上書きされる）');
});

ok('表が変わるたびに保存する', () => {
  const recalc = grab('recalc');
  assert.ok(/saveCells\(\);/.test(recalc),
    'recalc から saveCells を呼んでいない');
});

ok('保存できていないことを画面に出す', () => {
  const check = grab('checkRules');
  assert.ok(/cellsPersist/.test(check) && /dbPersist/.test(check),
    'checkRules が保存失敗を拾っていない');
  assert.ok(/保存できていません/.test(check), '文言が無い');
});

ok('マスタの保存も、失敗を黙って捨てない', () => {
  const save = grab('save');
  assert.ok(/dbPersist = false/.test(save), 'save が失敗を握りつぶしている');
});

console.log(fail ? '\n■ ' + fail + ' 件 NG' : '\n■ すべて OK');
process.exit(fail ? 1 : 0);
