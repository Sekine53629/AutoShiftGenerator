// prototype/samples/staff-*.json を実際に配置へ通し、結果を要約する。
const fs = require('fs');
const src = fs.readFileSync('prototype/ShiftGrid.html', 'utf8');

function grab(n) {
  const at = src.indexOf('function ' + n + '(');
  if (at < 0) throw new Error(n);
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); }
  }
}
const L = t => src.split(/\r?\n/).find(l => l.includes(t));
const RULE_BLOCK = (() => {
  const a = src.indexOf('const RULE_NORMAL');
  const b = src.indexOf('const usesQuota');
  return src.slice(a, src.indexOf(';', b) + 1);
})();
const FNS = ['seedDb', 'nthMonday', 'holidaysOf', 'parseMonthDay', 'daysOfRangeInMonth',
  'closureMap', 'holidayInfoOf', 'storeRows', 'hoursOf', 'buildDays', 'offQuotaBase',
  'offQuotaFor', 'buildWeeks', 'placeOneStaff_', 'pickWeek_', 'needOf_', 'needOf_', 'shortage_',
  'firstOverrun_', 'repairRuns_'];

const make = new Function([
  'const DAY_COLS=31;', RULE_BLOCK,
  L('const DAYS_IN_MONTH'), L('const vernalDay'), L('const autumnalDay'),
  FNS.map(grab).join('\n'),
  'const DB=seedDb(); const activeStore="st1";',
  'const workSyms=()=>DB.patterns.filter(p=>p.work).map(p=>p.sym);',
  'const isWork=v=>v==="◯"||workSyms().indexOf(v)>=0;',
  'const pubOffSyms=()=>DB.patterns.filter(p=>!p.work&&p.pubOff).map(p=>p.sym);',
  'const isPubOff=v=>!!v&&pubOffSyms().indexOf(v)>=0;',
  'const values=new Map();',
  'const get=(row,c)=>values.get(row.key+"|"+c)||"";',
  'const setV=(row,c,v)=>{if(v)values.set(row.key+"|"+c,v);else values.delete(row.key+"|"+c);};',
  'let docShift=null;',
  'function docCount(c){ if(!docShift) return 0; let n=0;',
  '  ["doc1","doc2","doc3","doc4","doc5"].forEach(k=>{ if(docShift[k]&&docShift[k][days[c].day]) n++; }); return n; }',
  'const paintRow=()=>{}; let autoNotes=[];',
  'const note_=t=>{if(autoNotes.indexOf(t)<0)autoNotes.push(t);};',
  'let ROWS=[]; let days=[];',
  'function inService(s,y,m){ const ym=y*100+m;',
  '  const num=t=>{const p=String(t||"").split(/[-\\/]/); return p.length>=2?Number(p[0])*100+Number(p[1]):0;};',
  '  const f=num(s.from), t=num(s.to); if(f&&ym<f) return false; if(t&&ym>t) return false; return true; }',
  'return function(staffList, y, m, doc, hours, rules){',
  '  DB.staff = staffList; docShift = doc;',
  '  // 指定が無いパターンは初期値へ戻す。前のパターンの設定が残ると数字が狂う',
  '  const base = seedDb();',
  '  DB.hours = hours ? hours : base.hours;',
  '  DB.rules = Object.assign(base.rules, rules || {});',
  '  days = buildDays(y,m); values.clear(); autoNotes=[];',
  '  const live = staffList.filter(s=>inService(s,y,m));',
  '  ROWS = live.map((s,i)=>({kind:"staff",index:i,key:s.id,label:s.name,staff:s,',
  '    role: s.kind==="事務員"?"clerk":(s.employment==="派遣"?"dispatch":"pharm")}));',
  '  const weeks = buildWeeks();',
  '  ROWS.forEach(row=>{ if(row.staff.rule==="手動") return;',
  '    placeOneStaff_(row,row.staff,weeks,"公休"); });',
  '  return {days,weeks,ROWS,DB,get,isWork,isPubOff,offQuotaFor,',
  '          quota:offQuotaBase(),notes:autoNotes,docCount};',
  '};'
].join('\n'))();

const longest = (pred, cols) => {
  let b = 0, c = 0;
  cols.forEach(x => { if (pred(x)) { c++; b = Math.max(b, c); } else c = 0; });
  return b;
};

const staffFiles = fs.readdirSync('prototype/samples')
  .filter(f => (f.startsWith('staff-') || f.startsWith('setup-')) && f.endsWith('.json'));
const doc = JSON.parse(fs.readFileSync('prototype/samples/doctor-shift-2026-10.json', 'utf8')).shift;

let bad = 0;
staffFiles.forEach(f => {
  const j = JSON.parse(fs.readFileSync('prototype/samples/' + f, 'utf8'));
  [[2026, 10], [2026, 11]].forEach(([y, m]) => {
    const r = make(j.staff, y, m, m === 10 ? doc : null, j.hours, j.rules);
    const im = [];
    for (let c = 0; c < 31; c++) if (r.days[c].inMonth) im.push(c);

    let ok = true, blanks = 0, autoN = 0;
    r.ROWS.forEach(row => {
      const s = row.staff;
      if (s.rule === '手動') return;
      autoN++;
      const pub = im.filter(c => r.isPubOff(r.get(row, c))).length;
      const q = r.offQuotaFor();
      const cap = s.maxCons || r.DB.rules.maxConsDefault;
      const run = longest(c => r.isWork(r.get(row, c)), im);
      blanks += im.filter(c => !r.get(row, c)).length;
      if (s.rule === '通常' && pub !== q) { ok = false; console.log('    NG 公休 ' + s.name + ' ' + pub + '≠' + q); bad++; }
      if (run > cap) { ok = false; console.log('    NG 連勤 ' + s.name + ' ' + run + '>' + cap); bad++; }
      if (s.rule !== '固定曜日') r.weeks.forEach((w, i) => {
        const on = w.cols.filter(c => r.isWork(r.get(row, c))).length;
        const lim = Math.min(Number(s.weekDays) || 0, w.cols.length);
        if (on > lim) { ok = false; console.log('    NG 週 ' + s.name + ' 第' + (i + 1) + '週 ' + on + '>' + lim); bad++; }
      });
    });

    // 曜日下限を割る日
    let shortDays = 0;
    im.forEach(c => {
      if (!r.days[c].open) return;
      let on = 0;
      r.ROWS.forEach(row => {
        if (row.role !== 'clerk' && r.isWork(r.get(row, c))) on++;
      });
      if (on < r.days[c].pharmMin) shortDays++;
    });

    console.log('  ' + f.replace('.json', '').padEnd(20) + y + '/' + String(m).padStart(2, '0')
      + '  在籍' + String(r.ROWS.length).padStart(2) + '名(自動' + autoN + ')'
      + '  ノルマ' + String(r.quota).padStart(2)
      + '  記号未定' + String(blanks).padStart(3) + '日'
      + '  下限割れ' + String(shortDays).padStart(2) + '日'
      + '  ' + (ok ? '整合OK' : '★NG'));
    if (r.notes.length) {
      const uniq = [...new Set(r.notes.map(t => t.replace(/^[^：]+：/, '')))];
      uniq.slice(0, 3).forEach(t => console.log('      ・' + t));
      if (uniq.length > 3) console.log('      ・ほか ' + (uniq.length - 3) + ' 種');
    }
  });
});

console.log('');
console.log(bad ? ('整合 NG ' + bad + ' 件') : 'すべてのパターンで 公休ビタビタ／連勤上限／週上限 を満たした');
process.exit(bad ? 1 : 0);
