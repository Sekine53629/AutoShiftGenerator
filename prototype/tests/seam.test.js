// 月をまたぐ週（継ぎ目の週）で、週の勤務上限を超えていないかを見る。
//
// buildWeeks() は月内だけで週を切るので、継ぎ目の週は前月ぶんと今月ぶんに
// 分断される。それぞれが上限まで埋まると、暦の1週間としては上限を超える。
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

const FN = ['seedDb', 'nthMonday', 'holidaysOf', 'parseMonthDay', 'daysOfRangeInMonth',
  'closureMap', 'holidayInfoOf', 'storeRows', 'hoursOf', 'buildDays', 'offQuotaBase',
  'offQuotaFor', 'buildWeeks', 'placeOneStaff_', 'pickWeek_', 'needOf_', 'clerkCapOf_',
  'shortage_', 'firstOverrun_', 'repairRuns_', 'normDow_', 'syncDemand_', 'migrateDb_',
  'inService', 'belongsHere', 'buildRows', 'seamWorkedOf_'];

const has = n => src.indexOf('function ' + n + '(') >= 0;
const FN2 = FN.filter(has);

// 医師名欄の行数まわり（clamp_ / DOC_ROWS_* / docRowCount_ / busyDocN_）を
// HTML から丸ごと取る。seedDb と migrateDb_ がこれを参照する。
const DOC_BLOCK = src.slice(src.indexOf('const clamp_ ='),
  src.indexOf('}', src.indexOf('function busyDocN_')) + 1);

const api = new Function([
  'const DAY_COLS=31; const DOC_ROWS=5;',
  'const DOW=["日","月","火","水","木","金","土"];',
  RULE, DOC_BLOCK, L('const DAYS_IN_MONTH'), L('const vernalDay'), L('const autumnalDay'),
  FN2.map(grab).join('\n'),
  L('  const isInput ='), upto('const dowNames_ ='),
  L('  const closedClass ='), L('  const isClosed ='), L('  const byOrder ='),
  'const DB=migrateDb_(seedDb()); const activeStore="st1";',
  'const workSyms=()=>DB.patterns.filter(p=>p.work).map(p=>p.sym);',
  'const isWork=v=>v==="◯"||workSyms().indexOf(v)>=0;',
  'const pubOffSyms=()=>DB.patterns.filter(p=>!p.work&&p.pubOff).map(p=>p.sym);',
  'const isPubOff=v=>!!v&&pubOffSyms().indexOf(v)>=0;',
  'const values=new Map(); let curYm=""; let days=[]; let ROWS=[];',
  'let curYear_=0, curMonth_=0;',
  upto('const cellKey ='),
  'const get=(r,c)=>values.get(cellKey(r,c))||"";',
  'const setV=(r,c,v)=>{if(v)values.set(cellKey(r,c),v);else values.delete(cellKey(r,c));};',
  'const docCount=()=>0; const paintRow=()=>{}; let autoNotes=[];',
  'const note_=t=>{if(autoNotes.indexOf(t)<0)autoNotes.push(t);};',
  'function gen(y,m){',
  '  curYm = y+"-"+String(m).padStart(2,"0"); curYear_=y; curMonth_=m;',
  '  days = buildDays(y,m);',
  '  ROWS = buildRows(y,m);',
  '  const w = buildWeeks();',
  '  ROWS.forEach(r=>{ if(r.kind==="staff" && r.staff.rule!==RULE_MANUAL)',
  '    placeOneStaff_(r,r.staff,w,"公休"); });',
  '}',
  // 指定した日の記号を、月をまたいで引く
  'function valOn(staffId, y, m, d){',
  '  return values.get(staffId+"|"+y+"-"+String(m).padStart(2,"0")+"|"+d) || "";',
  '}',
  'return { gen, valOn, isWork, DB, staff: () => DB.staff };'
].join('\n'))();

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** 対象月の1日を含む暦の1週間（日〜土）を、月をまたいで返す */
function seamWeek(y, m) {
  const first = new Date(y, m - 1, 1);
  const sun = new Date(first);
  sun.setDate(sun.getDate() - first.getDay());     // その週の日曜まで戻る
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(d.getDate() + i);
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), dow: d.getDay() });
  }
  return out;
}

let ng = 0;
const check = (ok, label, detail) => {
  if (!ok) { ng++; console.log('  NG  ' + label + (detail ? '  ' + detail : '')); }
};

// 継ぎ目が週の途中に来る月を選ぶ（1日が日曜だと分断が起きない）
const CASES = [[2026, 9, 2026, 10], [2026, 10, 2026, 11], [2026, 11, 2026, 12], [2027, 1, 2027, 2]];

CASES.forEach(([py, pm, ny, nm]) => {
  api.gen(py, pm);          // 前月を組む
  api.gen(ny, nm);          // 今月を組む（前月の入力は残る）

  const week = seamWeek(ny, nm);
  const split = week.filter(x => x.m === pm).length;
  console.log('');
  console.log('══ ' + py + '/' + pm + ' → ' + ny + '/' + nm
    + '   継ぎ目の週: ' + week.map(x => x.m + '/' + x.d).join(' ')
    + '（前月 ' + split + ' 日 ＋ 今月 ' + (7 - split) + ' 日）');
  if (split === 0) { console.log('  1日が日曜なので分断なし'); return; }

  console.log('  氏名       ルール   週上限  継ぎ目の週の出勤  内訳');
  api.staff().forEach(s => {
    if (s.rule === '手動') return;
    const marks = week.map(x => api.valOn(s.id, x.y, x.m, x.d));
    const n = marks.filter(v => api.isWork(v)).length;
    const cap = Number(s.weekDays) || 0;
    const over = s.rule !== '固定曜日' && cap > 0 && n > cap;
    console.log('  ' + s.name.padEnd(9) + s.rule.padEnd(8)
      + String(cap).padStart(4) + String(n).padStart(14) + '        '
      + week.map((x, i) => DOW[x.dow] + (api.isWork(marks[i]) ? '出' : '休')).join(' ')
      + (over ? '   ★上限超え' : ''));
    check(!over, s.name + ' の継ぎ目の週が週上限を超えた', n + ' > ' + cap);
  });
});

console.log('');
console.log(ng ? ('★ 継ぎ目の週で上限超え ' + ng + ' 件') : '継ぎ目の週: 週の勤務上限を守れている');
process.exit(ng ? 1 : 0);
