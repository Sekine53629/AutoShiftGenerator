// 医師名欄の行数が設定で変わることを見る。
//
// 実物のシフト表は月ごとに 4〜6 行で増減していて、診療数も半年で
// 平均 3.21 診 → 4.45 診へ上がっていた（docs/REAL-SHIFT-ANALYSIS.md）。
// 5 行に固定していると 6 診の日が入力できず、医師数が過少に出る。
//
//   node prototype/tests/docrows.test.js
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
const L = t => src.split(/\r?\n/).find(l => l.includes(t));
const upto = m => { const a = src.indexOf(m); return src.slice(a, src.indexOf(';', a) + 1); };
const RULE = src.slice(src.indexOf('const RULE_NORMAL'),
  src.indexOf(';', src.indexOf('const usesQuota')) + 1);

const FN = ['seedDb', 'nthMonday', 'holidaysOf', 'parseMonthDay', 'daysOfRangeInMonth',
  'closureMap', 'holidayInfoOf', 'storeRows', 'hoursOf', 'buildDays', 'offQuotaBase',
  'offQuotaFor', 'normDow_', 'syncDemand_', 'migrateDb_', 'inService', 'belongsHere',
  'buildRows', 'needOf_'];

const DOC_BLOCK = src.slice(src.indexOf('const clamp_ ='),
  src.indexOf('}', src.indexOf('function busyDocN_')) + 1);

const api = new Function([
  'const DAY_COLS=31;', DOC_BLOCK,
  'const DOW=["日","月","火","水","木","金","土"];',
  RULE, L('const DAYS_IN_MONTH'), L('const vernalDay'), L('const autumnalDay'),
  src.slice(src.indexOf('const AGG_COLS'), src.indexOf('];', src.indexOf('const AGG_COLS')) + 2),
  L('  const aggHead_ ='),
  FN.map(grab).join('\n'),
  L('  const isInput ='), upto('const dowNames_ ='),
  L('  const closedClass ='), L('  const isClosed ='), L('  const byOrder ='),
  'let DB=migrateDb_(seedDb()); let activeStore="st1";',
  'const workSyms=()=>DB.patterns.filter(p=>p.work).map(p=>p.sym);',
  'const isWork=v=>v==="◯"||workSyms().indexOf(v)>=0;',
  'const pubOffSyms=()=>DB.patterns.filter(p=>!p.work&&p.pubOff).map(p=>p.sym);',
  'const isPubOff=v=>!!v&&pubOffSyms().indexOf(v)>=0;',
  'let days=[]; let ROWS=[]; let docNames={};',
  'const values=new Map(); let curYm="";',
  'let curYear_=0, curMonth_=0;',
  upto('const cellKey ='),
  'const get=(r,c)=>values.get(cellKey(r,c))||"";',
  'const setV=(r,c,v)=>{if(v)values.set(cellKey(r,c),v);else values.delete(cellKey(r,c));};',
  // docCount は画面と同じ数え方にする（医師行の埋まっているセル数）
  'function docCount(c){let n=0;ROWS.forEach(r=>{if(r.kind==="doctor"&&get(r,c))n++;});return n;}',
  'function build(y,m){',
  '  curYm=y+"-"+String(m).padStart(2,"0"); curYear_=y; curMonth_=m;',
  '  days=buildDays(y,m); ROWS=buildRows(y,m); return ROWS;',
  '}',
  'function docRows(){return ROWS.filter(r=>r.kind==="doctor");}',
  'return { DB, build, docRows, docCount, needOf_, values, cellKey,',
  '         docRowCount_, busyDocN_, syncDemand_, aggHead_, AGG_COLS, days:()=>days,',
  '         seedDb, migrateDb_ };'
].join('\n'))();

let fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  OK  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
};

console.log('■ 医師名欄の行数');

ok('既定は6行（実物が最大6行なので、5行固定だと6診が入らない）', () => {
  api.build(2026, 10);
  assert.strictEqual(api.docRowCount_(), 6);
  assert.strictEqual(api.docRows().length, 6);
});

ok('行数を変えると医師行の本数が変わる', () => {
  [3, 4, 5, 6, 8, 10].forEach(n => {
    api.DB.rules.docRows = n;
    api.build(2026, 10);
    assert.strictEqual(api.docRows().length, n, n + ' 行にならない');
  });
});

ok('範囲外の値は丸める（0や99を入れても壊れない）', () => {
  api.DB.rules.docRows = 0;      // 0 は falsy なので既定に戻る
  assert.strictEqual(api.docRowCount_(), 6);
  api.DB.rules.docRows = 99;
  assert.strictEqual(api.docRowCount_(), 10);
  api.DB.rules.docRows = 1;
  assert.strictEqual(api.docRowCount_(), 3);
  api.DB.rules.docRows = 6;
});

ok('6行あれば6診の日を数えられる', () => {
  api.DB.rules.docRows = 6;
  const rows = api.build(2026, 10);
  const docs = rows.filter(r => r.kind === 'doctor');
  docs.forEach(r => api.values.set(api.cellKey(r, 0), '医師' + r.key));
  assert.strictEqual(api.docCount(0), 6);
});

ok('行数を減らしても入力済みの医師名は消えない', () => {
  api.DB.rules.docRows = 4;      // doc5 / doc6 は表から消える
  api.build(2026, 10);
  assert.strictEqual(api.docCount(0), 4, '表に出るのは4人ぶん');
  api.DB.rules.docRows = 6;      // 戻すと元の6人が復活する
  api.build(2026, 10);
  assert.strictEqual(api.docCount(0), 6, '戻したのに値が消えている');
});

console.log('■ 必要人数マスタの追随');

ok('行数を増やすと必要人数の表もその診療数まで伸びる', () => {
  api.DB.rules.docRows = 9;
  api.syncDemand_(api.DB);
  for (let d = 0; d <= 9; d++) {
    assert.ok(api.DB.demand.some(r => Number(r.doctors) === d), d + ' 診の行が無い');
  }
});

ok('伸ばした行は直前の行の値を引き継ぐ（0人にならない）', () => {
  const six = api.DB.demand.find(r => Number(r.doctors) === 6);
  const seven = api.DB.demand.find(r => Number(r.doctors) === 7);
  assert.strictEqual(Number(seven.min), Number(six.min));
  assert.strictEqual(Number(seven.target), Number(six.target));
  assert.ok(Number(seven.target) > 0, '目安が0人になっている');
});

ok('行数を減らしても必要人数の値は残る（増やし直すと戻る）', () => {
  api.DB.demand.find(r => Number(r.doctors) === 8).target = 7;
  api.DB.rules.docRows = 4;
  api.syncDemand_(api.DB);
  api.DB.rules.docRows = 9;
  api.syncDemand_(api.DB);
  assert.strictEqual(Number(api.DB.demand.find(r => Number(r.doctors) === 8).target), 7);
});

ok('必要人数の表は医師数の順に並ぶ', () => {
  const ds = api.DB.demand.map(r => Number(r.doctors));
  assert.deepStrictEqual(ds, ds.slice().sort((a, b) => a - b));
});

console.log('■ 「◯診出勤」の集計列');

ok('見出しは設定した診療数を出す', () => {
  api.DB.rules.busyDocN = 5;
  const busy = api.AGG_COLS[api.AGG_COLS.length - 1];
  assert.strictEqual(api.aggHead_(busy), '5診出勤');
  api.DB.rules.busyDocN = 6;
  assert.strictEqual(api.aggHead_(busy), '6診出勤');
  api.DB.rules.busyDocN = 5;
});

ok('ほかの列の見出しは変わらない', () => {
  assert.strictEqual(api.aggHead_(api.AGG_COLS[0]), '公休');
  assert.strictEqual(api.aggHead_(api.AGG_COLS[2]), '○早番');
});

console.log('■ 曜日別下限の扱い');

// 必要人数は診療数で決まり、曜日では決まらない。休診日に処方箋の需要はほとんど
// 無く、営業は診療に合わせている（祝日も病院が開くので祝日は営業日）。
// 曜日別下限は既定で使わない。面薬局のために設定で戻せる。
function needWith(docs, floor, mode) {
  api.DB.rules.weekdayFloor = mode;
  api.DB.rules.docRows = 6;
  api.build(2026, 10);
  api.days()[0].pharmMin = floor;
  const rows = api.docRows();
  for (let i = 0; i < docs; i++) api.values.set(api.cellKey(rows[i], 0), 'D' + i);
  for (let i = docs; i < rows.length; i++) api.values.delete(api.cellKey(rows[i], 0));
  return api.needOf_(0);
}

ok('既定は曜日別下限を使わない（医師3診・下限5 → 3人）', () => {
  assert.strictEqual(needWith(3, 5, 'off').target, 3, '下限5に引き上げられている');
});

ok('医師0人の日も、既定では下限を使わない', () => {
  const n = needWith(0, 5, 'off');
  assert.strictEqual(n.target, 1, '0診の行（薬剤師1名で開局）にならない');
});

ok('「医師欄が空の日だけ」を選べば、医師0の日に下限が効く', () => {
  assert.strictEqual(needWith(0, 5, 'noDoctor').target, 5);
  assert.strictEqual(needWith(3, 5, 'noDoctor').target, 3, '医師が入った日に効いている');
});

ok('「常に使う」を選べば従来どおり大きいほうを採る（面薬局）', () => {
  assert.strictEqual(needWith(3, 5, 'always').target, 5);
});

ok('下限より医師数が多ければ、どの設定でも医師数が勝つ', () => {
  ['off', 'noDoctor', 'always'].forEach(m => {
    assert.strictEqual(needWith(6, 2, m).target, 6, m + ' で医師数が負けている');
  });
});

ok('新しいデータの既定は「使わない」', () => {
  assert.strictEqual(api.migrateDb_(api.seedDb()).rules.weekdayFloor, 'off');
});

ok('真偽値ひとつだった頃の設定を3択に移す', () => {
  const a = api.seedDb();
  delete a.rules.weekdayFloor;
  a.rules.floorOnlyWhenNoDoctor = true;
  const ma = api.migrateDb_(a);
  assert.strictEqual(ma.rules.weekdayFloor, 'noDoctor');
  assert.strictEqual(ma.rules.floorOnlyWhenNoDoctor, undefined, '古い項目が残っている');

  const b = api.seedDb();
  delete b.rules.weekdayFloor;
  b.rules.floorOnlyWhenNoDoctor = false;
  assert.strictEqual(api.migrateDb_(b).rules.weekdayFloor, 'always');
});

ok('知らない値が入っていたら既定に戻す', () => {
  const c = api.seedDb();
  c.rules.weekdayFloor = 'なにこれ';
  assert.strictEqual(api.migrateDb_(c).rules.weekdayFloor, 'off');
});

console.log(fail ? '\n■ ' + fail + ' 件 NG' : '\n■ すべて OK');
process.exit(fail ? 1 : 0);
