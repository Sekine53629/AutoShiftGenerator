// 表を組み立てた時点で、セルの中身まで書けているかを確かめる。
//
// 「データは正しいのに表示だけ空」は、集計だけが動くので気づきにくい。
// 実際、tbody を document に入れる前に document.querySelector で
// セルを探していたため、スタッフ欄が空のまま出る不具合があった。
// 最小限の DOM を用意して、組み立て結果を直接見る。
const fs = require('fs');
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

/* ── 最小限の DOM ────────────────────────────────────── */
function makeNode(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [], _text: '', className: '', title: '', colSpan: 1,
    dataset: {}, style: {}, attrs: {},
    classList: {
      add(c) { if (!node.className.split(' ').includes(c)) node.className = (node.className + ' ' + c).trim(); },
      remove(c) { node.className = node.className.split(' ').filter(x => x && x !== c).join(' '); },
      contains(c) { return node.className.split(' ').includes(c); },
      toggle(c, on) { if (on) node.classList.add(c); else node.classList.remove(c); },
    },
    appendChild(c) { node.children.push(c); return c; },
    setAttribute(k, v) { node.attrs[k] = v; },
    addEventListener() {},
    get textContent() {
      return node._text + node.children.map(c => c.textContent).join('');
    },
    set textContent(v) { node._text = String(v); node.children = []; },
    querySelector(sel) {
      const hit = n => (sel.startsWith('.')
        ? n.classList && n.classList.contains(sel.slice(1))
        : n.tagName === sel.toUpperCase());
      const walk = n => {
        for (const c of n.children) {
          if (hit(c)) return c;
          const r = walk(c);
          if (r) return r;
        }
        return null;
      };
      return walk(node);
    },
  };
  return node;
}
const document = {
  createElement: makeNode,
  querySelector: () => null,          // ここが null を返すのが以前の落とし穴
  querySelectorAll: () => [],
};

/* ── 本体から必要な関数を取り出す ─────────────────────── */
const FN = ['seedDb', 'nthMonday', 'holidaysOf', 'parseMonthDay', 'daysOfRangeInMonth',
  'closureMap', 'holidayInfoOf', 'storeRows', 'hoursOf', 'buildDays', 'normDow_',
  'syncDemand_', 'migrateDb_', 'inService', 'belongsHere', 'buildRows', 'needOf_', 'offQuotaBase',
  'offQuotaFor', 'annualQuotaOf', 'clearAnnualCache_', 'staffTip', 'dayClass',
  'dayTip', 'headCells', 'el', 'naDay_', 'fillCell_', 'buildBody', 'clerkCapOf_'];

// 医師名欄の行数まわり（clamp_ / DOC_ROWS_* / docRowCount_ / busyDocN_）を
// HTML から丸ごと取る。seedDb と migrateDb_ がこれを参照する。
const DOC_BLOCK = src.slice(src.indexOf('const clamp_ ='),
  src.indexOf('}', src.indexOf('function busyDocN_')) + 1);

const run = new Function('document', [
  'const DAY_COLS=31; const DOC_ROWS=5;',
  'const DOW=["日","月","火","水","木","金","土"];',
  RULE, DOC_BLOCK, L('const DAYS_IN_MONTH'), L('const vernalDay'), L('const autumnalDay'),
  src.slice(src.indexOf('const AGG_COLS'), src.indexOf('];', src.indexOf('const AGG_COLS')) + 2),
  L('  const aggHead_ ='),   // 「◯診出勤」の見出しは設定で変わるので描くときに作る
  FN.map(grab).join('\n'),
  L('  const isInput ='), upto('const dowNames_ ='), L('  const closedClass ='),
  L('  const isClosed ='), L('  const byOrder ='),
  'const DB=migrateDb_(seedDb()); const activeStore="st1";',
  'const workSyms=()=>DB.patterns.filter(p=>p.work).map(p=>p.sym);',
  'const isWork=v=>v==="◯"||workSyms().indexOf(v)>=0;',
  'const values=new Map(); let curYm="2026-10";',
  'let days=buildDays(2026,10);',
  upto('const cellKey ='),
  // 色の印。記号とは別の層で背景を塗る
  upto('const markKey ='), L('  const getMark ='), L('  const markOf ='),
  'const get=(r,c)=>values.get(cellKey(r,c))||"";',
  'const setV=(r,c,v)=>{if(v)values.set(cellKey(r,c),v);else values.delete(cellKey(r,c));};',
  'const docCount=()=>0;',
  'let ROWS=buildRows(2026,10);',
  // 医師・スタッフ・備考に値を入れてから組み立てる
  'ROWS.forEach(r=>{',
  '  if(r.kind==="doctor") setV(r,0,"医A");',
  '  if(r.kind==="staff"){ setV(r,0,"○"); setV(r,1,"公休"); }',
  '  if(r.kind==="note") setV(r,0,"銀行"); });',
  'const body = buildBody();',
  'return { body, ROWS };'
].join('\n'))(document);

/* ── 検査 ────────────────────────────────────────────── */
let ng = 0;
const check = (ok, label, detail) => {
  if (!ok) { ng++; console.log('  NG  ' + label + (detail ? '  ' + detail : '')); }
};

// 組み立てた tbody から、行ごとの1〜2日目の中身を拾う
function readRow(body, rowIndex) {
  const tr = body.children.find(t =>
    t.children.some(td => td.dataset && String(td.dataset.row) === String(rowIndex)));
  if (!tr) return null;
  const cells = tr.children.filter(td => td.dataset && td.dataset.col !== undefined);
  return cells.slice(0, 2).map(td => {
    const inp = td.querySelector('input');
    if (inp) return inp.value || '';
    const v = td.querySelector('.v');
    return v ? v.textContent : '';
  });
}

console.log('■ 表を組み立てた時点で、セルの中身が書けているか');
const kinds = { doctor: null, staff: null, note: null };
run.ROWS.forEach(r => {
  if (kinds[r.kind] === null) kinds[r.kind] = readRow(run.body, r.index);
});
Object.keys(kinds).forEach(k => {
  const got = kinds[k];
  console.log('  ' + k.padEnd(8) + JSON.stringify(got));
});
check(kinds.doctor && kinds.doctor[0] === '医A', '医師名欄が書けている', JSON.stringify(kinds.doctor));
check(kinds.staff && kinds.staff[0] === '○' && kinds.staff[1] === '公休',
  'スタッフ欄が書けている', JSON.stringify(kinds.staff));
check(kinds.note && kinds.note[0] === '銀行', '備考行が書けている', JSON.stringify(kinds.note));

console.log('');
console.log('■ 出られない曜日が灰色になるか（実物と同じ扱い）');

// 実物のシフト表は、出られない曜日のセルを #d0cece で潰している。
// マスタには入っているのに表からは読み取れず、空欄と見分けが付かなかった。
const naRun = new Function('document', [
  'const DAY_COLS=31;', DOC_BLOCK,
  'const DOW=["日","月","火","水","木","金","土"];',
  RULE, L('const DAYS_IN_MONTH'), L('const vernalDay'), L('const autumnalDay'),
  src.slice(src.indexOf('const AGG_COLS'), src.indexOf('];', src.indexOf('const AGG_COLS')) + 2),
  L('  const aggHead_ ='),
  FN.map(grab).join('\n'),
  L('  const isInput ='), upto('const dowNames_ ='),
  L('  const closedClass ='), L('  const isClosed ='), L('  const byOrder ='),
  'let DB=migrateDb_(seedDb()); const activeStore="st1";',
  'const workSyms=()=>DB.patterns.filter(p=>p.work).map(p=>p.sym);',
  'const isWork=v=>v==="◯"||workSyms().indexOf(v)>=0;',
  'const pubOffSyms=()=>DB.patterns.filter(p=>!p.work&&p.pubOff).map(p=>p.sym);',
  'const isPubOff=v=>!!v&&pubOffSyms().indexOf(v)>=0;',
  'const values=new Map(); let curYm="2026-10";',
  'let curYear_=2026, curMonth_=10;',
  upto('const cellKey ='),
  // 色の印。記号とは別の層で背景を塗る
  upto('const markKey ='), L('  const getMark ='), L('  const markOf ='),
  'const get=(r,c)=>values.get(cellKey(r,c))||"";',
  'const setV=(r,c,v)=>{if(v)values.set(cellKey(r,c),v);else values.delete(cellKey(r,c));};',
  'const docCount=()=>0; const paintRow=()=>{};',
  'let days=buildDays(2026,10);',
  // 1人だけ 月火金土 しか出られなくする（実物の「(月火金土18時)」と同じ形）
  'DB.staff.forEach((s,i)=>{ s.availDow = i===0 ? [0,1,1,0,0,1,1] : [1,1,1,1,1,1,1]; });',
  'let ROWS=buildRows(2026,10);',
  'const body = buildBody();',
  'return { body, ROWS, days, DB };'
].join('\n'))(document);

function cellsOf(body, rowIndex) {
  const tr = body.children.find(t =>
    t.children.some(td => td.dataset && String(td.dataset.row) === String(rowIndex)));
  if (!tr) return [];
  return tr.children.filter(td => td.dataset && td.dataset.col !== undefined);
}

const limited = naRun.ROWS.find(r => r.kind === 'staff');
const free = naRun.ROWS.filter(r => r.kind === 'staff')[1];
const limCells = cellsOf(naRun.body, limited.index);
const freeCells = cellsOf(naRun.body, free.index);

let wrongOn = 0, wrongOff = 0;
limCells.forEach((td, c) => {
  const info = naRun.days[c];
  if (!info || !info.inMonth) return;
  const na = String(td.className).split(/\s+/).indexOf('na') >= 0;
  const canWork = !!limited.staff.availDow[info.dow];
  if (canWork && na) wrongOn++;          // 出られる日に灰色が付いた
  if (!canWork && !na) wrongOff++;       // 出られない日に灰色が付かない
});
check(wrongOn === 0, '出られる曜日に灰色を付けていない', '誤 ' + wrongOn + ' 件');
check(wrongOff === 0, '出られない曜日をすべて灰色にした', '漏れ ' + wrongOff + ' 件');

const anyFree = freeCells.some(td => String(td.className).split(/\s+/).indexOf('na') >= 0);
check(!anyFree, '全曜日出られる人には灰色を付けない');

const naCount = limCells.filter(td =>
  String(td.className).split(/\s+/).indexOf('na') >= 0).length;
console.log('  月火金土のみ出勤の人: 灰色 ' + naCount + ' 日 / 31 日中');
check(naCount > 0, '灰色が1つも付いていない');

// 医師欄・備考行には付けない（出られる曜日は社員だけの設定）
const docRow = naRun.ROWS.find(r => r.kind === 'doctor');
const docNa = cellsOf(naRun.body, docRow.index).some(td =>
  String(td.className).split(/\s+/).indexOf('na') >= 0);
check(!docNa, '医師欄には灰色を付けない');

console.log('');
console.log('■ document から探さずに書けているか（未挿入でも効くこと）');
console.log('  document.querySelector は常に null を返す状態で組み立てた');
check(kinds.staff && kinds.staff[0] !== '', '画面に載せる前でもスタッフ欄が埋まる');

console.log('');
console.log(ng ? ('★ NG ' + ng + ' 件') : '描画: すべて意図どおり');
process.exit(ng ? 1 : 0);
