// prototype/samples/ にテスト用の JSON を作り、そのまま配置に通して結果を出す。
// 氏名はすべて架空。実在の職員・医師は書かない（Tier 3）。
const fs = require('fs');
const path = require('path');

const OUT = 'prototype/samples';
fs.mkdirSync(OUT, { recursive: true });

const ALL = [1, 1, 1, 1, 1, 1, 1];
const dow = (...ok) => [0, 1, 2, 3, 4, 5, 6].map(d => (ok.indexOf(d) >= 0 ? 1 : 0));

let seq = 0;
function person(o) {
  seq++;
  return Object.assign({
    id: 's' + String(seq).padStart(3, '0'),
    name: '', kind: '薬剤師', employment: '社員',
    weekDays: 5, annualOff: '', maxCons: 5,
    patterns: ['○', '●', '▲'], availDow: ALL.slice(), fixedDow: [0, 0, 0, 0, 0, 0, 0],
    canClose: true, from: '', to: '', rule: '通常', memo: '',
    hq: false, stores: []   // 担当店舗が空＝全店
  }, o);
}

function leaveFor(staff) {
  return staff.filter(s => s.employment === '社員')
    .map((s, i) => ({
      id: 'lv' + String(i + 1).padStart(3, '0'), staffId: s.id,
      grantDate: '2026-04-01', grantDays: 10 + (i % 5), usedDays: i % 4
    }));
}

// ─────────────────────────────────────────────────────────
// 社員・派遣のパターン
// ─────────────────────────────────────────────────────────
const PATTERNS = {};

seq = 0;
PATTERNS['staff-standard'] = {
  title: '標準構成',
  aim: '常勤中心。全員が土日祝も出られる。まずここが素直に組めるか',
  staff: [
    ...'ABCDEF'.split('').map(x => person({ name: '薬剤師 ' + x })),
    person({ name: '薬剤師 G', weekDays: 4, maxCons: 4, rule: '週N日', availDow: dow(0, 1, 2, 5, 6) }),
    person({ name: '派遣 1', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false, memo: '調剤のみ。締め不可' }),
    person({ name: '派遣 2', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false, memo: '調剤のみ。締め不可' }),
    ...'ABC'.split('').map(x => person({ name: '事務 ' + x, kind: '事務員', patterns: ['○', '●'] })),
    person({ name: '事務 D', kind: '事務員', weekDays: 4, maxCons: 4, rule: '週N日',
             patterns: ['○'], availDow: dow(1, 2, 3, 5), canClose: false })
  ]
};

seq = 0;
PATTERNS['staff-short'] = {
  title: '人手不足',
  aim: '常勤4名＋派遣2名。曜日下限を割る日が出るか、過不足がマイナスに振れるか',
  staff: [
    ...'ABCD'.split('').map(x => person({ name: '薬剤師 ' + x })),
    person({ name: '派遣 1', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false }),
    person({ name: '派遣 2', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false }),
    ...'AB'.split('').map(x => person({ name: '事務 ' + x, kind: '事務員', patterns: ['○', '●'] }))
  ]
};

seq = 0;
PATTERNS['staff-strict-run'] = {
  title: '連勤上限が厳しい',
  aim: '全員3日まで。連勤の入れ替えが働き、公休がノルマちょうどのままか',
  staff: [
    ...'ABCDEFGH'.split('').map(x => person({ name: '薬剤師 ' + x, maxCons: 3 })),
    ...'ABC'.split('').map(x => person({ name: '事務 ' + x, kind: '事務員',
             maxCons: 3, patterns: ['○', '●'] }))
  ]
};

seq = 0;
PATTERNS['staff-parttime'] = {
  title: 'パート中心',
  aim: '週3〜4が多い。公休枠を超える休みが空欄で出て、有休・夏休の判断が要る形になるか',
  staff: [
    ...'AB'.split('').map(x => person({ name: '薬剤師 ' + x })),
    person({ name: '薬剤師 C', weekDays: 4, maxCons: 4, rule: '週N日', availDow: dow(0, 1, 2, 4, 6) }),
    person({ name: '薬剤師 D', weekDays: 4, maxCons: 4, rule: '週N日', availDow: dow(1, 3, 4, 5, 6) }),
    person({ name: '薬剤師 E', weekDays: 3, maxCons: 3, rule: '固定曜日',
             fixedDow: dow(2, 3, 5), availDow: dow(2, 3, 5, 6),
             patterns: ['●'], canClose: false, memo: '火水金 固定' }),
    person({ name: '薬剤師 F', weekDays: 3, maxCons: 3, rule: '週N日',
             availDow: dow(0, 1, 4, 5), patterns: ['○'], canClose: false }),
    person({ name: '派遣 1', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false }),
    ...'AB'.split('').map(x => person({ name: '事務 ' + x, kind: '事務員',
             weekDays: 4, maxCons: 4, patterns: ['○', '●'] }))
  ]
};

seq = 0;
PATTERNS['staff-turnover'] = {
  title: '入退職あり',
  aim: '在籍期間で表に出る人が月ごとに変わるか。10月で1名退職、11月から1名入職',
  staff: [
    ...'ABCD'.split('').map(x => person({ name: '薬剤師 ' + x })),
    person({ name: '薬剤師 E', to: '2026-10', memo: '2026年10月末で退職' }),
    person({ name: '薬剤師 F', from: '2026-11', memo: '2026年11月入職' }),
    person({ name: '派遣 1', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false }),
    ...'AB'.split('').map(x => person({ name: '事務 ' + x, kind: '事務員', patterns: ['○', '●'] }))
  ]
};

seq = 0;
PATTERNS['setup-onsite'] = {
  title: '現場の構成に近い形',
  aim: '実際に使われている構成と曜日別下限を写したもの。氏名は伏せてある。'
     + '薬剤師7名（うち1名は日水木が出られず締め不可、1名は週4）＋派遣2名＋事務2名。'
     + '連続出勤の上限は全員3日',
  // 曜日別の薬剤師 下限（日 月 火 水 木 金 土）
  pharmMin: [2, 6, 5, 3, 5, 6, 3],
  rules: { maxConsDefault: 3, maxOffRun: 14, reqPlus: 1, lateN: 3 },
  staff: [
    ...[1, 2, 3, 4, 5].map(i => person({ name: '薬剤師 ' + i, maxCons: 3 })),
    person({ name: '薬剤師 6', maxCons: 3, availDow: dow(1, 2, 5, 6), canClose: false,
             memo: '日・水・木は出られない。締め作業不可' }),
    person({ name: '薬剤師 7', weekDays: 4, maxCons: 4, rule: '週N日', memo: '週4' }),
    person({ name: '派遣 1', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲'], canClose: false, memo: '遅番のみ' }),
    person({ name: '派遣 2', employment: '派遣', rule: '手動', weekDays: 0, maxCons: 6,
             patterns: ['▲', '●'], canClose: false, memo: '中長期' }),
    ...[1, 2].map(i => person({ name: '事務 ' + i, kind: '事務員', maxCons: 3,
             patterns: ['○', '▲'] }))
  ]
};

Object.keys(PATTERNS).forEach(key => {
  const p = PATTERNS[key];
  const body = {
    _comment: '社員マスタの見本【' + p.title + '】' + p.aim
      + ' / 実在の職員ではありません。データ書き出しタブに貼って「貼り付けた内容を取り込む」。'
      + (p.pharmMin ? ' staff / leave / hours / rules を差し替えます。'
                    : ' staff と leave だけを差し替えます。'),
    staff: p.staff,
    leave: leaveFor(p.staff)
  };
  // 曜日別の下限は店舗営業マスタが持つので、指定があれば一緒に入れる
  if (p.pharmMin) {
    body.hours = [0, 1, 2, 3, 4, 5, 6].map(d => ({
      id: 'h' + d, storeId: 'st1', dow: d, open: true,
      from: '10:00', to: '20:00',
      pharmMin: p.pharmMin[d], clerkMin: 1
    }));
    body.rules = Object.assign({
      reqPlus: 1, earlyN: 1, lateN: 1, midN: 0, clerkEarlyN: 1,
      countNationalOff: true, maxConsDefault: 5, maxOffRun: 3,
      needCloser: true, wishMax: 3, carryOver: true
    }, p.rules || {});
  }
  fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify(body, null, 2) + '\n', 'utf8');
});

// ─────────────────────────────────────────────────────────
// 医師の出勤表
// ─────────────────────────────────────────────────────────
function nthMonday(y, m, n) {
  return 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + (n - 1) * 7;
}

function makeDoctorShift(y, m, slots, holidays) {
  const last = new Date(y, m, 0).getDate();
  const shift = {};
  slots.forEach(s => { shift[s.key] = {}; });
  for (let day = 1; day <= last; day++) {
    const d = new Date(y, m - 1, day).getDay();
    const nth = Math.floor((day - 1) / 7) + 1;
    slots.forEach(s => {
      const name = s.rule({ dow: d, nth: nth, day: day, holiday: !!holidays[day] });
      if (name) shift[s.key][day] = name;
    });
  }
  return shift;
}

const DOC_SETS = {};

// 医院が日曜・祝日は休診（薬局は開けるので、その日は医師0名）
DOC_SETS['doctor-shift-2026-10'] = {
  y: 2026, m: 10, title: '日曜・祝日は休診',
  aim: '薬局は開くが医師は0名。曜日下限だけで人を置くことになる日が出る',
  slots: [
    { key: 'doc1', rule: d => (d.dow !== 0 && !d.holiday ? '山田' : '') },
    { key: 'doc2', rule: d => ([1, 2, 3, 4, 5].indexOf(d.dow) >= 0 && !d.holiday ? '佐藤' : '') },
    { key: 'doc3', rule: d => (!d.holiday && [1, 3, 5].indexOf(d.dow) >= 0 ? '鈴木'
                             : !d.holiday && [2, 4].indexOf(d.dow) >= 0 ? '伊藤' : '') },
    { key: 'doc4', rule: d => (d.holiday ? ''
                             : d.dow === 1 || d.dow === 4 ? '高橋'
                             : d.dow === 3 && (d.nth === 2 || d.nth === 4) ? '田中'
                             : d.dow === 5 ? '中村'
                             : d.dow === 2 && (d.nth === 1 || d.nth === 3) ? '加藤' : '') },
    { key: 'doc5', rule: d => (d.holiday ? ''
                             : d.dow === 2 && (d.nth === 1 || d.nth === 3) ? '小林'
                             : d.dow === 5 && d.nth === 2 ? '中村'
                             : d.dow === 6 ? '渡辺' : '') }
  ]
};

// 日曜も診療する（土日祝も営業する店に合わせた形）
DOC_SETS['doctor-shift-2026-10-sunday'] = {
  y: 2026, m: 10, title: '日曜・祝日も診療',
  aim: '休診日が無い。医師数がそのまま必要人数に効く',
  slots: [
    { key: 'doc1', rule: () => '山田' },
    { key: 'doc2', rule: d => (d.dow === 0 || d.dow === 6 ? '' : '佐藤') },
    { key: 'doc3', rule: d => ([1, 3, 5].indexOf(d.dow) >= 0 ? '鈴木'
                             : [2, 4].indexOf(d.dow) >= 0 ? '伊藤'
                             : d.dow === 0 ? '渡辺' : '') },
    { key: 'doc4', rule: d => (d.dow === 1 || d.dow === 4 ? '高橋'
                             : d.dow === 3 ? '田中'
                             : d.dow === 5 ? '中村' : '') },
    { key: 'doc5', rule: d => (d.dow === 2 && d.nth % 2 === 1 ? '小林'
                             : d.dow === 6 ? '渡辺'
                             : d.dow === 5 && d.nth === 2 ? '加藤' : '') }
  ]
};

// 混雑月。5診の日を多くして「5診出勤」と過不足を強く動かす
DOC_SETS['doctor-shift-2026-11-busy'] = {
  y: 2026, m: 11, title: '混雑月（5診が多い）',
  aim: '医師5名の日を増やし、必要人数が跳ね上がったときの過不足を見る',
  slots: [
    { key: 'doc1', rule: d => (d.dow !== 0 ? '山田' : '') },
    { key: 'doc2', rule: d => (d.dow !== 0 ? '佐藤' : '') },
    { key: 'doc3', rule: d => (d.dow !== 0 && d.dow !== 6 ? '鈴木' : '') },
    { key: 'doc4', rule: d => (d.dow !== 0 && d.dow !== 6 ? '高橋' : '') },
    { key: 'doc5', rule: d => ([1, 2, 3, 4, 5].indexOf(d.dow) >= 0 ? '小林'
                             : d.dow === 6 ? '渡辺' : '') }
  ]
};

Object.keys(DOC_SETS).forEach(key => {
  const s = DOC_SETS[key];
  const holidays = {};
  if (s.m === 10) holidays[nthMonday(s.y, 10, 2)] = 'スポーツの日';
  if (s.m === 11) { holidays[3] = '文化の日'; holidays[23] = '勤労感謝の日'; }
  const shift = makeDoctorShift(s.y, s.m, s.slots, holidays);
  const body = {
    _comment: '医師の出勤表【' + s.title + '】' + s.aim
      + ' / 実在の医師ではありません。データ書き出しタブに貼って「貼り付けた内容を取り込む」。'
      + ' 医師名欄だけを差し替えます。',
    targetMonth: s.y + '-' + String(s.m).padStart(2, '0'),
    shift: shift
  };
  fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify(body, null, 2) + '\n', 'utf8');
  const last = new Date(s.y, s.m, 0).getDate();
  const counts = [];
  for (let d = 1; d <= last; d++) counts.push(s.slots.filter(x => shift[x.key][d]).length);
  s.counts = counts;
});

console.log('■ 社員マスタ');
Object.keys(PATTERNS).forEach(k => {
  const p = PATTERNS[k];
  const auto = p.staff.filter(s => s.rule === '自動').length;
  console.log('  ' + (k + '.json').padEnd(26) + p.title.padEnd(14)
    + ' 計' + String(p.staff.length).padStart(2) + '名（自動' + auto
    + '／手動' + (p.staff.length - auto) + '）'
    + (p.pharmMin ? '  曜日下限 ' + p.pharmMin.join(' ') : ''));
});
console.log('');
console.log('■ 医師の出勤表');
Object.keys(DOC_SETS).forEach(k => {
  const s = DOC_SETS[k];
  const five = s.counts.map((c, i) => (c >= 5 ? i + 1 : null)).filter(Boolean);
  const zero = s.counts.map((c, i) => (c === 0 ? i + 1 : null)).filter(Boolean);
  console.log('  ' + (k + '.json').padEnd(34) + s.title);
  console.log('      医師数 ' + s.counts.join(' '));
  console.log('      5診の日 ' + (five.join(',') || 'なし') + ' ／ 医師0名の日 ' + (zero.join(',') || 'なし'));
});
