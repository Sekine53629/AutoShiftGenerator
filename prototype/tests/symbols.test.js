// 早番・遅半・遅番の配り方を確かめる。
//
// これが無かったころは placeOneStaff_ が「その人の使える記号の1つ目」を
// 全日に使っており、全員が毎日 ○早番 になっていた。
//
//   node prototype/tests/symbols.test.js
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

/**
 * 配りの部分だけを動かす。表や日付の組み立ては要らないので、
 * 出勤する人が決まった状態を作って assignShiftSymbols_ に渡す。
 *
 * @param {Array<Array<string>>} pats 人ごとの使える記号
 * @param {Object} rules earlyN / midN / clerkEarlyN
 * @param {number} nDays 日数
 * @param {Array<number>} offOf 人ごとの休みの日（0始まり）
 */
function run(pats, rules, nDays, offOf) {
  const api = new Function([
    'const DAY_COLS = ' + nDays + ';',
    'const PATS = ' + JSON.stringify(pats) + ';',
    'const OFF = ' + JSON.stringify(offOf || []) + ';',
    'const DB = { rules: ' + JSON.stringify(rules) + ', patterns: [',
    '  { sym: "○", start: "10:00", end: "19:00", work: true, order: 1 },',
    '  { sym: "●", start: "10:30", end: "19:30", work: true, order: 2 },',
    '  { sym: "▲", start: "11:00", end: "20:00", work: true, order: 3 },',
    '  { sym: "公休", work: false, order: 4 } ] };',
    'const byOrder = l => l.slice().sort((a,b) => (a.order||0)-(b.order||0));',
    'const isWork = v => ["○","●","▲"].indexOf(v) >= 0;',
    'const cells = new Map();',
    'const key = (r,c) => r.index + "|" + c;',
    'const get = (r,c) => cells.get(key(r,c)) || "";',
    'const setV = (r,c,v) => { if (v) cells.set(key(r,c), v); else cells.delete(key(r,c)); };',
    'const days = [];',
    'for (let c = 0; c < DAY_COLS; c++) days.push({ inMonth: true, open: true, day: c + 1, from: "10:00", to: "20:00" });',
    'const ROWS = PATS.map((p, i) => ({',
    '  kind: "staff", index: i, key: "s" + i, label: "s" + i,',
    '  role: p.role || "pharm",',
    '  staff: { patterns: p.syms } }));',
    // 休み以外は全部出勤にしておく
    'ROWS.forEach((r, i) => { for (let c = 0; c < DAY_COLS; c++) {',
    '  if ((OFF[i] || []).indexOf(c) >= 0) { setV(r, c, "公休"); continue; }',
    '  setV(r, c, "▲"); } });',
    // 開局を覆えるだけの早番を置くので、時刻の読み取りも要る
    grab('minOf_'), grab('assignShiftSymbols_'),
    'assignShiftSymbols_(new Set());',
    'return { ROWS, get, days };',
  ].join('\n'))();

  const per = api.ROWS.map(r => {
    const c2 = {};
    const dayOf = {};
    for (let c = 0; c < nDays; c++) {
      const v = api.get(r, c);
      if (!['○', '●', '▲'].includes(v)) continue;
      c2[v] = (c2[v] || 0) + 1;
      (dayOf[v] = dayOf[v] || []).push(c);
    }
    return { label: r.label, syms: r.staff.patterns, count: c2, dayOf: dayOf };
  });
  const byDay = [];
  for (let c = 0; c < nDays; c++) {
    const d = {};
    api.ROWS.forEach(r => {
      const v = api.get(r, c);
      if (['○', '●', '▲'].includes(v)) d[v] = (d[v] || 0) + 1;
    });
    byDay.push(d);
  }
  return { per: per, byDay: byDay };
}

let fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  OK  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
};
const ALL = ['○', '●', '▲'];
const RULES = { earlyN: 1, midN: 1, clerkEarlyN: 1 };

console.log('■ 使える記号しか当てない');

ok('その人が使えない記号は出ない', () => {
  const r = run([{ syms: ['○', '●'] }, { syms: ['▲'] }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 28);
  r.per.forEach(p => {
    Object.keys(p.count).forEach(sym => {
      assert.ok(p.syms.indexOf(sym) >= 0,
        p.label + ' に使えない ' + sym + ' が当たっている');
    });
  });
});

ok('記号が1つだけの人は毎日それになる', () => {
  const r = run([{ syms: ['○'] }, { syms: ALL }, { syms: ALL }, { syms: ALL }],
    RULES, 28);
  assert.strictEqual(r.per[0].count['○'], 28);
  assert.strictEqual(Object.keys(r.per[0].count).length, 1);
});

console.log('■ 人の間で均等に配る');

ok('全員が同じ記号を使えるとき、早番の数がほぼ揃う', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  const n = r.per.map(p => p.count['○'] || 0);
  assert.ok(Math.max.apply(null, n) - Math.min.apply(null, n) <= 1,
    '早番の差が2以上ある: ' + JSON.stringify(n));
});

ok('遅番をやらない人は、遅番の分母から外れる', () => {
  // 5人のうち1人が遅番なし。残り4人で遅番を分ける
  const r = run([{ syms: ['○', '●'] }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  assert.strictEqual(r.per[0].count['▲'], undefined, '遅番なしの人に遅番が付いた');
  const n = r.per.slice(1).map(p => p.count['▲'] || 0);
  assert.ok(Math.max.apply(null, n) - Math.min.apply(null, n) <= 2,
    '残り4人の遅番が偏っている: ' + JSON.stringify(n));
});

ok('遅半の数も人の間で揃う', () => {
  // 早番と遅半は別々の回り持ちで、噛み合うぶん1回ぶんはずれる。
  // 30日・5人なら1人6回が理想で、5〜7に収まっていればよい
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  const n = r.per.map(p => p.count['●'] || 0);
  assert.ok(Math.max.apply(null, n) - Math.min.apply(null, n) <= 2,
    '遅半の差が3以上ある: ' + JSON.stringify(n));
  const ideal = 30 / 5;
  n.forEach(x => assert.ok(Math.abs(x - ideal) <= 1,
    '理想の ' + ideal + ' 回から2回以上ずれている: ' + JSON.stringify(n)));
});

console.log('■ 日の中で散らす');

ok('同じ人が早番を続けない', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  r.per.forEach(p => {
    const d = p.dayOf['○'] || [];
    for (let i = 1; i < d.length; i++) {
      assert.ok(d[i] - d[i - 1] > 1,
        p.label + ' が ' + d[i - 1] + ' と ' + d[i] + ' で続けて早番');
    }
  });
});

ok('早番の間隔がほぼ一定になる', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  const d = r.per[0].dayOf['○'] || [];
  assert.ok(d.length >= 4, '早番が少なすぎて確かめられない');
  const gaps = d.slice(1).map((x, i) => x - d[i]);
  assert.ok(Math.max.apply(null, gaps) - Math.min.apply(null, gaps) <= 2,
    '間隔がばらついている: ' + JSON.stringify(gaps));
});

console.log('■ 1日の必要数を守る');

ok('早番は1日1人（使える人がいる限り）', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  r.byDay.forEach((d, c) => {
    assert.strictEqual(d['○'] || 0, 1, (c + 1) + '日目の早番が ' + (d['○'] || 0) + ' 人');
  });
});

ok('遅番ができない人がいても、早番の定員は広がらない', () => {
  // 遅番なしが2人。この人たちは早番か遅半に入るしかない
  const r = run([{ syms: ['○', '●'] }, { syms: ['○', '●'] }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  const over = r.byDay.filter(d => (d['○'] || 0) > 1).length;
  assert.strictEqual(over, 0, '早番が2人以上の日が ' + over + ' 日');
});

ok('残りは全員 遅番になる', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30);
  r.byDay.forEach((d, c) => {
    assert.strictEqual((d['○'] || 0) + (d['●'] || 0) + (d['▲'] || 0), 5,
      (c + 1) + '日目の合計が5人でない');
    assert.strictEqual(d['▲'] || 0, 3, (c + 1) + '日目の遅番が3人でない');
  });
});

console.log('■ 休みの人には当てない');

ok('公休の日は記号を置き換えない', () => {
  const off = [[0, 1, 2], [], [], [], []];
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], RULES, 30, off);
  const d = r.per[0].dayOf;
  ALL.forEach(sym => {
    (d[sym] || []).forEach(c => {
      assert.ok(c > 2, '休みの ' + c + ' 日目に ' + sym + ' が付いた');
    });
  });
});

console.log('■ 早番は開局の1人だけ（遅半のほうが優先）');

// 早番に要るのは開局を覆う1人だけ。それ以上増やす理由が無い。
// 実物も R8.8月で ○40 / ●47 / ▲120 と、早番がいちばん少ない。
//
// 以前は minOnDuty（同時にいてほしい薬剤師）をそのまま早番の人数にしていた。
// 既定の2人が毎日早番に入り、遅半より多くなっていた。

ok('minOnDuty を上げても、早番は1人のまま', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 1, midN: 1, minOnDuty: 3 }, 20);
  r.byDay.forEach((d, c) => {
    assert.strictEqual(d['○'] || 0, 1,
      (c + 1) + '日目の早番が ' + (d['○'] || 0) + ' 人。minOnDuty を人数にしている');
  });
});

ok('人が足りないときに削られるのは早番。遅半は残る', () => {
  // 3人しか出ない日。早番1・遅半1・遅番1 に落ち着く。
  // earlyN を増やしても、増えたぶんから先に削れる
  const off = [[], [], [], [0], [0]];
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 3, midN: 1, minOnDuty: 2 }, 10, off);
  assert.strictEqual(r.byDay[0]['○'] || 0, 1, '早番が削られていない');
  assert.strictEqual(r.byDay[0]['●'] || 0, 1, '遅半が削られている');
  assert.strictEqual(r.byDay[0]['▲'] || 0, 1, '閉局まで残る人がいない');
});

ok('早番は0人にしない（開局に誰もいない日を作らない）', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 0, midN: 3, minOnDuty: 1 }, 20);
  r.byDay.forEach((d, c) => {
    assert.ok((d['○'] || 0) >= 1, (c + 1) + '日目に早番がいない');
  });
});

ok('遅半を増やすと、早番ではなく遅番から回る', () => {
  const a = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], { earlyN: 1, midN: 1 }, 20);
  const b = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }], { earlyN: 1, midN: 2 }, 20);
  assert.strictEqual(b.byDay[0]['○'] || 0, a.byDay[0]['○'] || 0, '早番が動いた');
  assert.strictEqual((b.byDay[0]['●'] || 0) - (a.byDay[0]['●'] || 0), 1);
  assert.strictEqual((a.byDay[0]['▲'] || 0) - (b.byDay[0]['▲'] || 0), 1);
});

ok('minOnDuty 1 なら早番は1人のまま', () => {
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 1, midN: 1, minOnDuty: 1 }, 20);
  r.byDay.forEach(d => assert.strictEqual(d['○'] || 0, 1));
});

ok('出勤が少ない日でも、締めの1人は必ず残す', () => {
  // 2人しか出ない日。minOnDuty 3 でも早番2人にはしない。
  // 全員を早番にすると遅番が0になり、遅半が上がったあとが無人になる
  const off = [[], [], [0], [0], [0]];
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 1, midN: 1, minOnDuty: 3 }, 10, off);
  assert.strictEqual(r.byDay[0]['▲'] || 0, 1, '閉局まで残る人がいない');
  assert.strictEqual((r.byDay[0]['○'] || 0) + (r.byDay[0]['●'] || 0), 1);
});

ok('早番の均等さは保たれる', () => {
  // 開局の1人は遅半より先に取る。遅半に取られた残りから選ぶと、
  // 早番が特定の人に寄る（実測で差が2に開いた）
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 1, midN: 1, minOnDuty: 2 }, 20);
  const n = r.per.map(p => p.count['○'] || 0);
  assert.ok(Math.max.apply(null, n) - Math.min.apply(null, n) <= 1,
    '早番が偏っている: ' + JSON.stringify(n));
});

console.log('■ 時間帯の薄さ');

// 記号ごとに勤務時間が30分ずつずれているので、頭数が足りていても
// 開局直後だけ1人、ということが起きる。実物は
//   早番 10:00〜19:00 / 遅半 10:30〜19:30 / 遅番 11:00〜20:00
// なので、早番が1人だと 10:00〜10:30 が1人になる。

const cov = new Function([
  'const DB = { patterns: [',
  '  { sym: "○", start: "10:00", end: "19:00", work: true },',
  '  { sym: "●", start: "10:30", end: "19:30", work: true },',
  '  { sym: "▲", start: "11:00", end: "20:00", work: true } ] };',
  'const isWork = v => ["○","●","▲"].indexOf(v) >= 0;',
  'let SYMS = [];',
  'const days = [{ from: "10:00", to: "20:00" }];',
  'const ROWS = [];',
  'const get = (r) => r.v;',
  grab('minOf_'), grab('coverageOf_'),
  'return { set: a => { ROWS.length = 0;',
  '  a.forEach((v, i) => ROWS.push({ kind: "staff", role: "pharm", v: v })); },',
  '  coverageOf_ };',
].join('\n'))();

ok('開局直後は早番しかいない', () => {
  cov.set(['○', '▲', '▲', '▲']);
  const r = cov.coverageOf_(0);
  assert.strictEqual(r.min, 1, '4人出ていても 10:00 は1人');
  assert.strictEqual(r.at, '10:00');
});

ok('早番が2人なら開局も2人', () => {
  cov.set(['○', '○', '▲', '▲']);
  assert.strictEqual(cov.coverageOf_(0).min, 2);
});

ok('早番1人＋遅半1人でも、10:00〜10:30 は1人', () => {
  cov.set(['○', '●', '▲', '▲']);
  const r = cov.coverageOf_(0);
  assert.strictEqual(r.min, 1, '遅半は 10:30 からなので開局は覆えない');
  assert.strictEqual(r.at, '10:00');
});

ok('誰も出ていない日は0人', () => {
  cov.set([]);
  assert.strictEqual(cov.coverageOf_(0).min, 0);
});

ok('知らない記号は数えない', () => {
  cov.set(['○', '×']);          // × はマスタに無い記号
  const r = cov.coverageOf_(0);
  assert.strictEqual(r.min, 0, '早番が19:00に上がったあと誰もいない');
  assert.strictEqual(r.at, '19:00');
});

console.log('■ 閉局まで残る人');

ok('遅番が0人の日は、閉局前が無人になると分かる', () => {
  // 早番10:00-19:00 と 遅半10:30-19:30 だけ。閉局は20:00
  cov.set(['○', '●', '●']);
  const r = cov.coverageOf_(0);
  assert.strictEqual(r.min, 0, '19:30〜20:00 が無人なのに気づいていない');
  assert.strictEqual(r.at, '19:30', '締め作業ができない時間帯');
});

ok('遅番が1人いれば閉局まで埋まる', () => {
  cov.set(['○', '●', '▲']);
  assert.ok(cov.coverageOf_(0).min >= 1);
});

ok('自動生成は遅番を0人にしない', () => {
  // 遅半を2人にしても、締めの1人は残る
  const r = run([{ syms: ALL }, { syms: ALL }, { syms: ALL },
                 { syms: ALL }, { syms: ALL }],
    { earlyN: 1, midN: 2, minOnDuty: 2 }, 20);
  r.byDay.forEach((d, c) => {
    assert.ok((d['▲'] || 0) >= 1, (c + 1) + '日目の遅番が0人');
  });
});

console.log(fail ? '\n■ ' + fail + ' 件 NG' : '\n■ すべて OK');
process.exit(fail ? 1 : 0);
