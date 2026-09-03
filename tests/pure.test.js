/**
 * tests/pure.test.js — GAS に載せずに検証できる部分のテスト
 *
 *   node tests/pure.test.js
 *
 * .gs をすべて連結して eval し、GAS のグローバル（SpreadsheetApp など）は
 * 最小限のスタブで代用する。純粋関数だけを対象にするので、
 * 実行にスプレッドシートは要らない。
 *
 * 【一番大事なテスト】
 *   SheetBuilder.planSheetPositions_() が決めた行位置を、
 *   Layout.resolveLayout() が同じ値として読み戻せるか。
 *   ここが合わないと、生成したシートは自動作成に使えない。
 *
 * 実名は一切使わない（Tier 3）。氏名は "A" "B" … で代用する。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// ---- GAS グローバルの最小スタブ ---------------------------------------
const sandbox = {
  console: console,
  SpreadsheetApp: {
    getActive: function () { throw new Error('stub: SpreadsheetApp は純粋関数から呼ばれてはいけない'); },
    getActiveSheet: function () { throw new Error('stub: SpreadsheetApp'); },
    getUi: function () { throw new Error('stub: SpreadsheetApp'); },
    flush: function () {},
    BorderStyle: { SOLID: 'SOLID' },
  },
  Utilities: { formatDate: function () { return 'stub'; } },
  PropertiesService: {
    getScriptProperties: function () { return { getProperty: function () { return null; } }; },
    getDocumentProperties: function () { return { getProperty: function () { return null; } }; },
  },
  Session: { getEffectiveUser: function () { return { getEmail: function () { return ''; } }; } },
  MailApp: { sendEmail: function () {} },
  UrlFetchApp: {},
  DriveApp: {},
  ScriptApp: {},
  HtmlService: {},
};
vm.createContext(sandbox);

const sources = fs.readdirSync(ROOT)
  .filter(function (f) { return f.endsWith('.gs'); })
  .sort();
sources.forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

// トップレベルの const は vm のグローバル「レキシカル」スコープに入るので、
// sandbox オブジェクトのプロパティにはならない。テストから読めるよう取り出す。
// （function 宣言は自動で sandbox に載るので、この扱いが要るのは const だけ）
Object.assign(sandbox, vm.runInContext(
  '({ CONFIG, LABEL, NAMED_RANGE, LAYOUT, SYM, KIND, RULE, CFG_MEMBER, CFG_SETTING,'
  + ' SETTING_DEFAULT, HOLIDAY_SHEET, CHANGELOG_SHEET, ENGINE_LIMIT, DOC_BUSY_N,'
  + ' NON_NAME_LABELS, MASK_NAMES, SHEET_BUILD, SETUP_KNOWN_HEADS,'
  + ' WORK_SYMS, WORK_SYM_PREFIX_MATCH, EDIT_REGION, STAMP_KIND, STAMP_REGION_RULES,'
  + ' SCHEMA, FORMAT_PROFILE, FORMAT_DEFAULT,'
  + ' ST_SKIP, ST_NONE, ST_WORK, ST_OFF, ST_FWORK, ST_FOFF })', sandbox));

// ---- テストランナー ----------------------------------------------------
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push({ name: name, message: e.message });
  }
}

// ---- 位置の整合（仕様書 §3.2 の解決規則） -----------------------------

test('planSheetPositions_ が Layout の相対規則を満たす', function () {
  [1, 5, 16, 40].forEach(function (staffRows) {
    const p = sandbox.planSheetPositions_(staffRows);
    assert.strictEqual(p.headerRow, p.dateRow - 1, 'headerRow = dateRow - 1');
    assert.strictEqual(p.weekRow, p.dateRow + 1, 'weekRow = dateRow + 1');
    assert.strictEqual(p.doctorBottom - p.doctorTop + 1, sandbox.LAYOUT.DOC_BLOCK_ROWS,
      '医師名欄は DOC_BLOCK_ROWS 行');
    assert.strictEqual(p.gridTop, p.repeatDateRow + sandbox.LAYOUT.DATE_REPEAT_GAP,
      'gridTop = repeatDateRow + DATE_REPEAT_GAP');
    assert.strictEqual(p.gridBottom, p.docRow - sandbox.LAYOUT.DOC_GAP,
      'gridBottom = docRow - DOC_GAP');
    assert.strictEqual(p.docRow, p.noteRow + sandbox.LAYOUT.NOTE_TO_DOC,
      'docRow = noteRow + NOTE_TO_DOC');
    assert.strictEqual(p.gridBottom, p.noteRow - sandbox.LAYOUT.NOTE_GAP,
      'gridBottom = noteRow - NOTE_GAP');
    assert.strictEqual(p.gridBottom - p.gridTop + 1, staffRows, 'スタッフ行数が一致');
  });
});

/**
 * planSheetPositions_ の結果どおりに値が入った偽シートを作り、
 * resolveLayout() が同じ位置を読み戻せるかを見る。
 */
function makeFakeSheet(p) {
  // Date は vm の中で作る。realm が違うと resolveLayout の
  // `value instanceof Date` が false になり、日付行を見つけられない。
  const vmDate = vm.runInContext('new Date(2026, 8, 1)', sandbox);
  const maxRows = p.shortageRow + 5;
  const bFormulas = [];
  const bValues = [];
  const aValues = [];
  for (let r = 1; r <= maxRows; r++) {
    const isDateRow = (r === p.dateRow || r === p.repeatDateRow);
    bFormulas.push([isDateRow ? '=A1' : '']);
    bValues.push([isDateRow ? vmDate : '']);

    let a = '';
    if (r === p.noteRow) a = sandbox.LABEL.NOTE;
    else if (r === p.docRow) a = sandbox.SHEET_BUILD.ROW_HEAD_DOC;
    else if (r === p.pharmRow) a = sandbox.SHEET_BUILD.ROW_HEAD_PHARM;
    else if (r === p.shortageRow) a = sandbox.SHEET_BUILD.ROW_HEAD_SHORTAGE;
    else if (r >= p.gridTop && r <= p.gridBottom) a = 'ｽﾀｯﾌ' + (r - p.gridTop + 1);
    aValues.push([a]);
  }

  function slice(src, startRow, numRows) {
    return src.slice(startRow - 1, startRow - 1 + numRows).map(function (row) { return row.slice(); });
  }

  return {
    getName: function () { return 'fake'; },
    getMaxRows: function () { return maxRows; },
    getSheetId: function () { return 1; },
    getRange: function (row, col, numRows) {
      if (col === sandbox.LAYOUT.COL_FIRST) {
        return {
          getFormulas: function () { return slice(bFormulas, row, numRows); },
          getValues: function () { return slice(bValues, row, numRows); },
        };
      }
      if (col === 1) {
        return { getValues: function () { return slice(aValues, row, numRows); } };
      }
      throw new Error('fake sheet: 想定外の列 ' + col);
    },
  };
}

test('生成した配置を resolveLayout が同じ位置として読み戻す', function () {
  [1, 5, 16, 40].forEach(function (staffRows) {
    const p = sandbox.planSheetPositions_(staffRows);
    const got = sandbox.resolveLayout(makeFakeSheet(p));
    ['dateRow', 'repeatDateRow', 'headerRow', 'weekRow', 'doctorTop', 'doctorBottom',
      'noteRow', 'docRow', 'pharmRow', 'shortageRow', 'gridTop', 'gridBottom',
      'firstCol', 'lastCol'].forEach(function (key) {
      assert.strictEqual(got[key], p[key],
        `staffRows=${staffRows} の ${key}: 生成 ${p[key]} / 解決 ${got[key]}`);
    });
  });
});

// ---- 列文字 -----------------------------------------------------------

test('toColumnLetter が列番号を列文字に直す', function () {
  const cases = [[1, 'A'], [2, 'B'], [26, 'Z'], [27, 'AA'], [32, 'AF'],
                 [33, 'AG'], [34, 'AH'], [39, 'AM'], [40, 'AN']];
  cases.forEach(function (c) {
    assert.strictEqual(sandbox.toColumnLetter(c[0]), c[1], `${c[0]} → ${c[1]}`);
  });
});

test('Config の列番号が仕様書 §3.1 の列と対応する', function () {
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_FIRST), 'B');
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_LAST), 'AF');
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_MONTH), 'AG');
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_AGG_FIRST), 'AH');
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_AGG_LAST), 'AM');
  assert.strictEqual(sandbox.toColumnLetter(sandbox.LAYOUT.COL_KIND_WORK), 'AN');
  assert.strictEqual(sandbox.LAYOUT.COL_LAST - sandbox.LAYOUT.COL_FIRST + 1, 31, '日付列は31日分');
});

// ---- isPaidOff は部分一致（仕様書 §10 のチェックリスト） --------------

test('isPaidOff は部分一致（「有休」で「有休※」も拾う）', function () {
  const def = sandbox.SETTING_DEFAULT.paidSyms.value;   // '有休,夏休'
  assert.strictEqual(sandbox.isPaidOff('有休', def), true);
  assert.strictEqual(sandbox.isPaidOff('有休※', def), true, '部分一致でなければならない');
  assert.strictEqual(sandbox.isPaidOff('夏休', def), true);
  assert.strictEqual(sandbox.isPaidOff('公休', def), false);
  assert.strictEqual(sandbox.isPaidOff('希休', def), false);
  assert.strictEqual(sandbox.isPaidOff('', def), false);
  assert.strictEqual(sandbox.isPaidOff('有休', '公休'), false, 'L11 を変えたら結果も変わる');
});

test('集計列 AH/AI の振り分けが仕様書 §5.4 の例と一致する', function () {
  const def = sandbox.SETTING_DEFAULT.paidSyms.value;
  // vm 側で作られた配列なので Array.from で Node 側の配列に移してから比べる
  assert.deepStrictEqual(Array.from(sandbox.splitOffSymbolsByQuota_(def, true)),
    ['公休', '希休'], 'AH（ノルマ対象）');
  assert.deepStrictEqual(Array.from(sandbox.splitOffSymbolsByQuota_(def, false)),
    ['夏休', '有休', '有休※'], 'AI（ノルマ外）');
});

// ---- 数式の組み立て ---------------------------------------------------

test('薬剤師出勤数の数式が MATCH に配列を渡さない（§5.3）', function () {
  const f = sandbox.buildPharmCountFormula_('B', 11, 26);
  assert.ok(f.indexOf('MATCH') < 0, 'MATCH を使わず作業列を参照すること');
  assert.ok(f.indexOf('$AN$11:$AN$26') >= 0, '区分の作業列 AN を参照する');
  assert.ok(f.indexOf('"薬剤師"') >= 0);
  Array.from(sandbox.WORK_SYMS).forEach(function (sym) {
    assert.ok(f.indexOf(`"${sym}*"`) >= 0 || f.indexOf(`"${sym}"`) >= 0,
      `出勤記号 ${sym} を数える`);
  });
});

test('出勤記号の集計が派遣行の「▲＋氏名」を拾う（先頭一致）', function () {
  assert.strictEqual(sandbox.WORK_SYM_PREFIX_MATCH, true,
    '既定は先頭一致（派遣行を頭数に入れる運用の前提）');

  const pharm = sandbox.buildPharmCountFormula_('B', 11, 26);
  assert.ok(pharm.indexOf('"▲*"') >= 0, '薬剤師出勤数がワイルドカードで数える');
  assert.ok(pharm.indexOf('COUNTIFS(') >= 0, 'COUNTIFS を使う');

  const late = sandbox.buildCountifSumFormula_(11, ['▲'], true);
  assert.strictEqual(late, '=COUNTIF(B11:AF11,"▲*")', '集計列 AK も先頭一致');

  // 休み記号は完全一致のまま（緩めると公休ノルマの数え方が isPaidOff とずれる）
  const off = sandbox.buildCountifSumFormula_(11, ['公休']);
  assert.strictEqual(off, '=COUNTIF(B11:AF11,"公休")', '休み記号は完全一致');
});

test('matchWorkSym が記号を正規化し、複合テキストも拾う', function () {
  assert.strictEqual(sandbox.matchWorkSym('○'), '○');
  assert.strictEqual(sandbox.matchWorkSym('◯'), '○', '別字体は ○ に正規化');
  assert.strictEqual(sandbox.matchWorkSym('▲'), '▲');
  assert.strictEqual(sandbox.matchWorkSym('●'), '●');

  // 実物の派遣行にある書き方（氏名は伏せて記号だけ再現する）
  assert.strictEqual(sandbox.matchWorkSym('▲＊＊＊＊'), '▲', '記号＋氏名を出勤とみなす');
  assert.strictEqual(sandbox.matchWorkSym('●＊＊'), '●');

  // 休みと空欄は出勤ではない
  ['公休', '希休', '夏休', '有休', '有休※', '', '  ', '↑15-20'].forEach(function (v) {
    assert.strictEqual(sandbox.matchWorkSym(v), '', `${JSON.stringify(v)} は出勤ではない`);
  });
});

test('isEarlySym と集計が同じ規則を見ている', function () {
  // Layout.isEarlySym は matchWorkSym に委譲しているので、
  // 先頭一致の設定を変えると両方が同時に変わる
  assert.strictEqual(sandbox.isEarlySym('○'), true);
  assert.strictEqual(sandbox.isEarlySym('◯'), true);
  assert.strictEqual(sandbox.isEarlySym('●'), false);
  assert.strictEqual(sandbox.isEarlySym('○＊＊'),
    sandbox.WORK_SYM_PREFIX_MATCH, '複合テキストの扱いはフラグに従う');
});

test('COUNTIF の和は記号ゼロ個のとき "=0"（"=" だけでは壊れる）', function () {
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, []), '=0');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, null), '=0');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, ['公休']),
    '=COUNTIF(B11:AF11,"公休")');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, ['○', '◯']),
    '=COUNTIF(B11:AF11,"○")+COUNTIF(B11:AF11,"◯")');
});

test('5診出勤の数式が DOC_BUSY_N を使い、行の形が COUNTIFS に揃う', function () {
  const f = sandbox.buildBusyDayFormula_(11, 31);
  assert.ok(f.indexOf(`,${sandbox.DOC_BUSY_N},`) >= 0, '混雑日のしきい値を共有定数から取る');
  assert.ok(f.indexOf('$B$31:$AF$31') >= 0, '医師数行を参照する');
  assert.ok(f.indexOf('B11:AF11') >= 0, '本人の行を参照する');
  // COUNTIFS は範囲の形が揃っている必要がある。どちらも 1 行 × 31 列
  assert.ok(f.indexOf('COUNTIFS(') >= 0, 'SUMPRODUCT ではなく COUNTIFS');
});

// ---- そのほかの純粋関数 -----------------------------------------------

test('isEarlySym が ○ と ◯ の揺れを吸収する', function () {
  assert.strictEqual(sandbox.isEarlySym('○'), true);
  assert.strictEqual(sandbox.isEarlySym('◯'), true, '全角の別字体も早番');
  assert.strictEqual(sandbox.isEarlySym('●'), false);
  assert.strictEqual(sandbox.isEarlySym(''), false);
});

test('isNonName が集計行のラベルを氏名でないと判定する', function () {
  assert.strictEqual(sandbox.isNonName(''), true);
  assert.strictEqual(sandbox.isNonName('医師数(診)'), true, '前方一致で拾う');
  assert.strictEqual(sandbox.isNonName('過不足'), true);
  assert.strictEqual(sandbox.isNonName('備考'), true);
  assert.strictEqual(sandbox.isNonName('ｽﾀｯﾌ1'), false);
});

test('parseYearMonth_ が年月の書き方の揺れを受ける', function () {
  // vm の中で作られたオブジェクトは prototype が違うので deepStrictEqual は使えない
  ['2026/9', '2026-09', '2026年9月', '2026.9'].forEach(function (text) {
    const got = sandbox.parseYearMonth_(text);
    assert.ok(got, `${text} を読めること`);
    assert.strictEqual(got.year, 2026, text);
    assert.strictEqual(got.month, 9, text);
  });
  assert.strictEqual(sandbox.parseYearMonth_('2026/13'), null, '13月は受けない');
  assert.strictEqual(sandbox.parseYearMonth_('2026/0'), null, '0月は受けない');
  assert.strictEqual(sandbox.parseYearMonth_('なにか'), null);
});

test('設定の読み出しが空欄・欠落で既定値に落ちる（§3.3）', function () {
  assert.strictEqual(sandbox.readSettingNumber_([], 'maxRun'),
    sandbox.SETTING_DEFAULT.maxRun.value, '行が無ければ既定値');
  assert.strictEqual(sandbox.readSettingNumber_([['連勤の上限(日)', '']], 'maxRun'),
    sandbox.SETTING_DEFAULT.maxRun.value, '空欄なら既定値');
  assert.strictEqual(sandbox.readSettingNumber_([['連勤の上限(日)', 'あ']], 'maxRun'),
    sandbox.SETTING_DEFAULT.maxRun.value, '非数値なら既定値');
  assert.strictEqual(sandbox.readSettingNumber_([['連勤の上限(日)', 5]], 'maxRun'), 5);
  assert.strictEqual(sandbox.readSettingText_([], 'paidSyms'),
    sandbox.SETTING_DEFAULT.paidSyms.value);
  assert.strictEqual(sandbox.readSettingText_([['ノルマ外の休み記号(カンマ区切り)', '有休']],
    'paidSyms'), '有休');
});

test('早番と事務員の早番を取り違えない（ラベルの片方が他方を含む）', function () {
  // 「早番(○) 人数/日」は「事務員の早番(○) 人数/日」に丸ごと含まれる。
  // 素朴な部分一致だと、並び順しだいで静かに取り違える。
  const pairs = [
    ['事務員の早番(○) 人数/日', 9],   // わざと先に置く
    ['早番(○) 人数/日', 1],
  ];
  assert.strictEqual(sandbox.readSettingNumber_(pairs, 'earlyN'), 1,
    '薬剤師の早番は 1 でなければならない');
  assert.strictEqual(sandbox.readSettingNumber_(pairs, 'clerkEarlyN'), 9,
    '事務員の早番は 9 でなければならない');
});

// ---- Web アプリの書き込み検証（仕様書 §6.3 の移植） -------------------

/** planSheetPositions_ の位置をそのまま layout として使う */
function layoutFor(staffRows) {
  const p = sandbox.planSheetPositions_(staffRows || 16);
  p.freeRow = p.doctorBottom + 1;
  return p;
}

test('classifyEditRegion_ が行を正しく仕分ける', function () {
  const L = layoutFor(16);
  const R = sandbox.EDIT_REGION;
  assert.strictEqual(sandbox.classifyEditRegion_(L.gridTop, L), R.GRID);
  assert.strictEqual(sandbox.classifyEditRegion_(L.gridBottom, L), R.GRID);
  assert.strictEqual(sandbox.classifyEditRegion_(L.doctorTop, L), R.DOCTOR);
  assert.strictEqual(sandbox.classifyEditRegion_(L.doctorBottom, L), R.DOCTOR);
  assert.strictEqual(sandbox.classifyEditRegion_(L.doctorBottom + 1, L), R.FREE);
  assert.strictEqual(sandbox.classifyEditRegion_(L.noteRow, L), R.NOTE);

  // 書き込ませてはいけない行
  [L.headerRow, L.dateRow, L.weekRow, L.repeatDateRow,
   L.docRow, L.pharmRow, L.shortageRow].forEach(function (row) {
    assert.strictEqual(sandbox.classifyEditRegion_(row, L), R.NONE, `行 ${row} は書き込み不可`);
  });
});

test('シフト記号は入力欄の外へ出せない（医師数が水増しされるため）', function () {
  const L = layoutFor(16);
  const docs = ['医師A', '医師B'];   // テスト用の仮名。実名は使わない
  const reject = function (row, value) {
    return sandbox.stampRejectReason_({ row: row, col: L.firstCol, value: value }, L, docs);
  };

  // 入力欄には入る
  ['○', '●', '▲', '公休', '希休', '有休'].forEach(function (sym) {
    assert.strictEqual(reject(L.gridTop, sym), '', `入力欄に ${sym} は入る`);
  });

  // 医師名欄・備考行・自由行には入らない
  [L.doctorTop, L.noteRow, L.doctorBottom + 1].forEach(function (row) {
    assert.ok(reject(row, '▲') !== '', `行 ${row} に ▲ を入れさせない`);
    assert.ok(reject(row, '公休') !== '', `行 ${row} に 公休 を入れさせない`);
  });
});

test('医師名は医師名欄にだけ入る', function () {
  const L = layoutFor(16);
  const docs = ['医師A', '医師B'];
  const reject = function (row, value) {
    return sandbox.stampRejectReason_({ row: row, col: L.firstCol, value: value }, L, docs);
  };

  assert.strictEqual(reject(L.doctorTop, '医師A'), '', '医師名欄には入る');
  assert.ok(reject(L.gridTop, '医師A') !== '', '入力欄には入れさせない');
  assert.ok(reject(L.doctorTop, '知らない名前') !== '',
    '医師名欄は N 列に登録された名前だけ');
});

test('備考行と自由行は自由記入、消去はどこでも許す', function () {
  const L = layoutFor(16);
  const docs = ['医師A'];
  const reject = function (row, value) {
    return sandbox.stampRejectReason_({ row: row, col: L.firstCol, value: value }, L, docs);
  };

  assert.strictEqual(reject(L.noteRow, '銀行'), '', '備考は自由記入');
  assert.strictEqual(reject(L.doctorBottom + 1, '発注担当'), '', '自由行も自由記入');

  // 消去（空文字）はどこでも通る。書き間違いを直せなくなるため（§6.3）
  [L.gridTop, L.doctorTop, L.noteRow, L.doctorBottom + 1].forEach(function (row) {
    assert.strictEqual(reject(row, ''), '', `行 ${row} で消去は許す`);
    assert.strictEqual(reject(row, '   '), '', '空白だけも消去と同じ扱い');
  });
});

test('書き込めない行と列は必ず弾く', function () {
  const L = layoutFor(16);
  const reject = function (row, col) {
    return sandbox.stampRejectReason_({ row: row, col: col, value: '○' }, L, []);
  };
  assert.ok(reject(L.docRow, L.firstCol) !== '', '集計行は弾く');
  assert.ok(reject(L.dateRow, L.firstCol) !== '', '日付行は弾く');
  assert.ok(reject(L.gridTop, 1) !== '', 'A列（氏名）は弾く');
  assert.ok(reject(L.gridTop, L.lastCol + 1) !== '', '日付列の右外は弾く');
  assert.strictEqual(reject(L.gridTop, L.lastCol), '', '日付列の右端は通る');
});

test('isShiftSymbol が記号と名前を区別する', function () {
  ['○', '◯', '●', '▲', '公休', '希休', '夏休', '有休', '有休※'].forEach(function (v) {
    assert.strictEqual(sandbox.isShiftSymbol(v), true, `${v} は記号`);
  });
  ['', '  ', '医師A', '銀行', '発注担当'].forEach(function (v) {
    assert.strictEqual(sandbox.isShiftSymbol(v), false, `${JSON.stringify(v)} は記号ではない`);
  });
});

test('画面の出し分け表がサーバの判定と噛み合っている', function () {
  const rules = sandbox.STAMP_REGION_RULES;
  const R = sandbox.EDIT_REGION;
  assert.deepStrictEqual(Array.from(rules.symbol), [R.GRID], '記号は入力欄だけ');
  assert.deepStrictEqual(Array.from(rules.doctor), [R.DOCTOR], '医師名は医師名欄だけ');
  assert.ok(Array.from(rules.erase).length === 4, '消去はどこでも押せる');
});

// ---- 祝日 CSV の読み取り（§7.2） -------------------------------------

test('祝日の日付は書き方の揺れを受け、ありえない日は弾く', function () {
  const ok = sandbox.parseHolidayDate_('2026/1/1');
  assert.ok(ok, '2026/1/1 を読める');
  assert.strictEqual(ok.getFullYear(), 2026);
  assert.strictEqual(ok.getMonth(), 0);
  assert.strictEqual(ok.getDate(), 1);

  ['2026-01-01', '2026.1.1'].forEach(function (t) {
    assert.ok(sandbox.parseHolidayDate_(t), `${t} を読める`);
  });

  // Date は 2/30 を 3/2 へ繰り上げてしまう。黙って別の日を祝日にしないこと
  assert.strictEqual(sandbox.parseHolidayDate_('2026/2/30'), null, '存在しない日は弾く');
  assert.strictEqual(sandbox.parseHolidayDate_('2026/13/1'), null, '13月は弾く');
  assert.strictEqual(sandbox.parseHolidayDate_('国民の祝日・休日月日'), null, '見出しは弾く');
  assert.strictEqual(sandbox.parseHolidayDate_(''), null);
});

test('祝日 CSV の見出しや空行が混ざっても止まらない', function () {
  const rows = sandbox.toHolidayRows_([
    ['国民の祝日・休日月日', '国民の祝日・休日名称'],   // 見出し
    ['2026/1/1', '元日'],
    [],                                                  // 空行
    ['2026/1/12', '成人の日'],
    ['こわれた行'],
  ]);
  assert.strictEqual(rows.length, 2, '読めた行だけ残す');
  assert.strictEqual(sandbox.toDateKey(rows[0][0]), '2026-01-01');
  assert.strictEqual(rows[0][1], '元日');
  assert.strictEqual(rows[1][1], '成人の日');
  // 日付は Date 型で書く。文字列だと COUNTIF が一致せず祝日 0 件になる
  // （vm の中で作られた Date なので instanceof は realm を跨げない。振る舞いで見る）
  assert.strictEqual(typeof rows[0][0].getFullYear, 'function', '日付型で返す');
  assert.strictEqual(typeof rows[0][0], 'object');
});

test('toDateKey が 0 埋めした yyyy-MM-dd を返す', function () {
  const d = vm.runInContext('new Date(2026, 0, 5)', sandbox);
  assert.strictEqual(sandbox.toDateKey(d), '2026-01-05');
});

// ---- 生成するシートのスキーマ ----------------------------------------

test('メンバー表の見出しが CFG_MEMBER の列順と揃っている', function () {
  const heads = Array.from(sandbox.SCHEMA.CFG_MEMBER_HEADS);
  assert.strictEqual(heads.length, 9, 'A〜I の9列');
  // 列定数と見出しの並びがずれると、氏名や区分を別の列から読むことになる
  assert.strictEqual(heads[sandbox.CFG_MEMBER.COL_NAME - 1], '氏名');
  assert.strictEqual(heads[sandbox.CFG_MEMBER.COL_KIND - 1], '区分');
  assert.strictEqual(heads[sandbox.CFG_MEMBER.COL_RULE - 1], '勤務ルール');
  assert.strictEqual(heads[sandbox.CFG_MEMBER.COL_MEMO - 1], '備考');
});

test('全体設定の既定値が過不足なく並ぶ', function () {
  const keys = Object.keys(sandbox.SETTING_DEFAULT);
  keys.forEach(function (key) {
    const def = sandbox.SETTING_DEFAULT[key];
    assert.ok(def.label && String(def.label).trim() !== '', `${key} にラベルがある`);
    assert.ok(def.value !== undefined, `${key} に既定値がある`);
  });
  // 生成した行はそのまま readSettingNumber_ / readSettingText_ で読み戻せること
  const pairs = keys.map(function (key) {
    return [sandbox.SETTING_DEFAULT[key].label, sandbox.SETTING_DEFAULT[key].value];
  });
  assert.strictEqual(sandbox.readSettingNumber_(pairs, 'maxRun'),
    sandbox.SETTING_DEFAULT.maxRun.value);
  assert.strictEqual(sandbox.readSettingNumber_(pairs, 'clerkEarlyN'),
    sandbox.SETTING_DEFAULT.clerkEarlyN.value, '事務員の早番を取り違えない');
  assert.strictEqual(sandbox.readSettingNumber_(pairs, 'earlyN'),
    sandbox.SETTING_DEFAULT.earlyN.value, '薬剤師の早番を取り違えない');
  assert.strictEqual(sandbox.readSettingText_(pairs, 'paidSyms'),
    sandbox.SETTING_DEFAULT.paidSyms.value);
});

// ---- 書式プロファイル -------------------------------------------------

test('プロファイルが無くても既定値だけで揃う', function () {
  const merged = sandbox.mergeProfileRows_(sandbox.FORMAT_DEFAULT, []);
  Array.from(sandbox.FORMAT_PROFILE.ROLES).forEach(function (role) {
    Array.from(sandbox.FORMAT_PROFILE.ATTRS).forEach(function (attr) {
      const key = `role.${role.key}.${attr.key}`;
      assert.ok(merged[key] !== undefined, `${key} に既定値がある`);
    });
  });
  ['col.name.width', 'col.day.width', 'col.agg.width',
   'day.satBg', 'day.sunBg', 'day.outMonthBg', 'day.outMonthFg',
   'format.date', 'format.month', 'label.agg'].forEach(function (key) {
    assert.ok(merged[key] !== undefined, `${key} に既定値がある`);
  });
});

test('プロファイルの値が既定値を上書きする', function () {
  const merged = sandbox.mergeProfileRows_(sandbox.FORMAT_DEFAULT, [
    ['col.day.width', 28],
    ['day.satBg', '#cfe2f3'],
    ['role.grid.bold', 'TRUE'],
  ]);
  assert.strictEqual(merged['col.day.width'], 28);
  assert.strictEqual(merged['day.satBg'], '#cfe2f3');
  assert.strictEqual(merged['role.grid.bold'], true, '文字列の TRUE を真偽値にする');
  assert.strictEqual(merged['col.agg.width'], sandbox.FORMAT_DEFAULT['col.agg.width'],
    '触っていない項目は既定値のまま');
});

test('空欄・知らないキー・壊れた値は既定値に落ちる', function () {
  const d = sandbox.FORMAT_DEFAULT;
  const merged = sandbox.mergeProfileRows_(d, [
    ['col.day.width', ''],          // 空欄 → 消しただけで既定値に戻る
    ['col.name.width', 'あいう'],    // 数値にならない
    ['role.grid.bold', 'たぶん'],    // 真偽値にならない
    ['knows.nothing', 99],          // 知らないキーは捨てる
    ['', 1],
  ]);
  assert.strictEqual(merged['col.day.width'], d['col.day.width']);
  assert.strictEqual(merged['col.name.width'], d['col.name.width']);
  assert.strictEqual(merged['role.grid.bold'], d['role.grid.bold']);
  assert.strictEqual(merged['knows.nothing'], undefined, '知らないキーは持ち込まない');
});

test('値の型が既定値と揃う（setFontSize に文字列を渡さないため）', function () {
  // シートは数値も真偽値も文字列で返しうる
  const merged = sandbox.mergeProfileRows_(sandbox.FORMAT_DEFAULT, [
    ['role.date.fontSize', '11'],
    ['role.date.bold', 'false'],
    ['role.date.bg', '#ffffff'],
  ]);
  assert.strictEqual(typeof merged['role.date.fontSize'], 'number');
  assert.strictEqual(merged['role.date.fontSize'], 11);
  assert.strictEqual(typeof merged['role.date.bold'], 'boolean');
  assert.strictEqual(merged['role.date.bold'], false);
  assert.strictEqual(typeof merged['role.date.bg'], 'string');
});

test('環境設定（JSON）が壊れていても既定値で動く', function () {
  const d = sandbox.FORMAT_DEFAULT;

  // 書式が読めないせいでシフト表そのものが作れなくなるのは割に合わない。
  // どの壊れ方でも既定値へ落として、生成できる側に倒す
  ['', null, undefined, '{壊れた', '[]', '123', '"文字列"', 'null'].forEach(function (json) {
    const p = sandbox.parseProfileJson_(json, d);
    assert.strictEqual(p['col.day.width'], d['col.day.width'],
      `${JSON.stringify(json)} でも既定値`);
  });
});

test('環境設定の JSON が既定値を上書きする', function () {
  const d = sandbox.FORMAT_DEFAULT;
  const p = sandbox.parseProfileJson_(JSON.stringify({
    'col.day.width': 26,
    'role.grid.fontSize': 9,
    'day.satBg': '#cfe2f3',
    'label.doc': '医師数',
    'まったく知らないキー': 'x',
  }), d);

  assert.strictEqual(p['col.day.width'], 26);
  assert.strictEqual(p['role.grid.fontSize'], 9);
  assert.strictEqual(p['day.satBg'], '#cfe2f3');
  assert.strictEqual(p['label.doc'], '医師数');
  assert.strictEqual(p['まったく知らないキー'], undefined, '知らないキーは持ち込まない');
  assert.strictEqual(p['col.agg.width'], d['col.agg.width'], '触っていない項目は既定値');
});

test('シートを直して反映する経路と、JSON から読む経路が同じ結果になる', function () {
  const d = sandbox.FORMAT_DEFAULT;
  // 控えシートを手で直した想定
  const fromSheet = sandbox.mergeProfileRows_(d, [
    ['col.day.width', '26'],
    ['role.grid.bold', 'TRUE'],
  ]);
  // それを保存して読み直した想定
  const fromJson = sandbox.parseProfileJson_(JSON.stringify(fromSheet), d);

  Object.keys(d).forEach(function (key) {
    assert.strictEqual(fromJson[key], fromSheet[key], `${key} が往復で変わらない`);
  });
});

test('条件付き書式で色分けしているシートから色を拾える', function () {
  // getBackgrounds() は条件付き書式の色を返さない。ルール側から拾う必要がある
  const rules = [
    { index: 1, kind: 'CUSTOM_FORMULA', bg: '#f2f2f2', fontColor: '#999999',
      formula: '=MONTH(B$2)<>MONTH($A$1)', ranges: 'B2:AF33' },
    { index: 2, kind: 'CUSTOM_FORMULA', bg: '#f4cccc', fontColor: '',
      formula: '=WEEKDAY(B$2)=1', ranges: 'B2:AF3' },
    { index: 3, kind: 'CUSTOM_FORMULA', bg: '#cfe2f3', fontColor: '',
      formula: '=WEEKDAY(B$2)=7', ranges: 'B2:AF3' },
  ];
  const got = sandbox.deriveDayColorsFromRules_(rules);
  assert.strictEqual(got['day.satBg'], '#cfe2f3');
  assert.strictEqual(got['day.sunBg'], '#f4cccc');
  assert.strictEqual(got['day.outMonthBg'], '#f2f2f2');
  assert.strictEqual(got['day.outMonthFg'], '#999999');
});

test('拾えない条件付き書式があっても壊れない', function () {
  const got = sandbox.deriveDayColorsFromRules_([
    { index: 1, kind: 'グラデーション', bg: '', fontColor: '', formula: '', ranges: '' },
    { index: 2, kind: 'TEXT_EQUAL_TO', bg: '#00ff00', fontColor: '',
      formula: '担当', ranges: 'B9:AF9' },      // 担当者の色分け。曜日とは無関係
    { index: 3, kind: 'CUSTOM_FORMULA', bg: '', fontColor: '',
      formula: '=WEEKDAY(B$2)=7', ranges: '' },  // 色が無いルールは使わない
  ]);
  // vm の中で作られたオブジェクトなので、キーの一覧で比べる
  assert.deepStrictEqual(Object.keys(got).sort(), [], '当たらなければ何も返さない');
  assert.deepStrictEqual(Object.keys(sandbox.deriveDayColorsFromRules_([])), []);
  assert.deepStrictEqual(Object.keys(sandbox.deriveDayColorsFromRules_(null)), []);
});

test('静的な色が塗られていれば条件付き書式より優先する', function () {
  const pick = sandbox.pickDayColor_;
  assert.strictEqual(pick('#dce6f1', '#cfe2f3', '#000000'), '#dce6f1', '静的が勝つ');

  // 白＝「塗っていない」とみなす。ここを見落とすと真っ白なプロファイルになる
  ['', '#ffffff', '#FFFFFF', 'white', '#fff', '   '].forEach(function (blank) {
    assert.strictEqual(pick(blank, '#cfe2f3', '#000000'), '#cfe2f3',
      `${JSON.stringify(blank)} は塗っていない扱い`);
  });
  assert.strictEqual(pick('', '', '#000000'), '#000000', 'どちらも無ければ既定値');
});

test('貼り付けられた JSON の読めない理由を具体的に返す', function () {
  const bad = function (text) {
    try { sandbox.parseImportedJson_(text); return null; }
    catch (e) { return e.message; }
  };
  assert.ok(bad('')?.indexOf('何も貼られていません') >= 0);
  assert.ok(bad('   ')?.indexOf('何も貼られていません') >= 0);
  assert.ok(bad('{"a":1')?.indexOf('JSON として読めません') >= 0, '途中で切れた JSON');
  assert.ok(bad('[1,2]')?.indexOf('形が違います') >= 0, '配列は受けない');
  assert.ok(bad('"文字列"')?.indexOf('形が違います') >= 0);
  assert.ok(bad('null')?.indexOf('形が違います') >= 0);

  const ok = sandbox.parseImportedJson_('{"col.day.width":30}');
  assert.strictEqual(ok['col.day.width'], 30);
});

test('横位置は Sheets が受ける語に揃える', function () {
  // Excel の「標準」は general で出てくるが setHorizontalAlignment は受けない
  assert.strictEqual(sandbox.normalizeHAlign_('general'), 'left');
  assert.strictEqual(sandbox.normalizeHAlign_(''), 'left');
  assert.strictEqual(sandbox.normalizeHAlign_(null), 'left');
  assert.strictEqual(sandbox.normalizeHAlign_('CENTER'), 'center');
  assert.strictEqual(sandbox.normalizeHAlign_('right'), 'right');
});

test('和暦の見出しは数式で組む（表示形式では作れないため）', function () {
  const tpl = sandbox.FORMAT_DEFAULT['title.formula'];
  const f = sandbox.buildTitleFormula_(tpl, 'A1');

  assert.ok(f.indexOf('{month}') < 0, 'プレースホルダが残らない');
  assert.ok(f.indexOf('A1') >= 0, '年月セルを参照する');
  // 実物は R08.08 形式。TEXT で0埋めしないと R8.8 になる
  assert.ok(f.indexOf('"00"') >= 0, '0埋めする');
  assert.strictEqual((f.match(/A1/g) || []).length, 2, '年・月の2か所に入る');

  // 空にすれば書かない（手で入力したい人のための逃げ道）
  assert.strictEqual(sandbox.buildTitleFormula_('', 'A1'), '');
  assert.strictEqual(sandbox.buildTitleFormula_('   ', 'A1'), '');
  assert.strictEqual(sandbox.buildTitleFormula_(null, 'A1'), '');
});

test('年月セルは日付のまま。和暦は別セルに置く', function () {
  // A1 を文字列にすると、祝日サマリー・条件付き書式・日付行が全部壊れる。
  // 和暦の置き場は A 列以外でなければならない
  assert.notStrictEqual(sandbox.FORMAT_DEFAULT['title.col'], 1,
    '和暦の見出しを A 列に置いてはいけない');
  assert.ok(sandbox.FORMAT_DEFAULT['title.col'] >= 1, '列番号は 1 以上');
});

test('roleFormat が役割の書式をまとめて返す', function () {
  const merged = sandbox.mergeProfileRows_(sandbox.FORMAT_DEFAULT, []);
  const fmt = sandbox.roleFormat(merged, 'grid');
  ['height', 'bg', 'fontColor', 'fontSize', 'bold', 'hAlign'].forEach(function (k) {
    assert.ok(fmt[k] !== undefined, `${k} を返す`);
  });
});

test('集計列の見出しは個数が合わないと既定値に落ちる', function () {
  const width = sandbox.LAYOUT.COL_AGG_LAST - sandbox.LAYOUT.COL_AGG_FIRST + 1;
  const ok = sandbox.aggHeadsFrom_({ 'label.agg': 'a,b,c,d,e,f' }, width);
  assert.deepStrictEqual(Array.from(ok), ['a', 'b', 'c', 'd', 'e', 'f']);

  // 1個足りないだけで列がずれるので、そのときは既定値を使う
  const short = sandbox.aggHeadsFrom_({ 'label.agg': 'a,b,c' }, width);
  assert.strictEqual(short.length, width, '足りなければ既定値');
  assert.deepStrictEqual(Array.from(short), Array.from(sandbox.SHEET_BUILD.AGG_HEADS));
});

test('プロファイルのキーに説明が付く（人が読めること）', function () {
  const merged = sandbox.mergeProfileRows_(sandbox.FORMAT_DEFAULT, []);
  const undescribed = Object.keys(merged).filter(function (key) {
    return sandbox.describeProfileKey_(key) === '';
  });
  assert.deepStrictEqual(undescribed, [], '説明の無いキー: ' + undescribed.join(', '));
});

// ---- ファイル名の衝突（Apps Script はファイル名が拡張子をまたいで一意） --

test('.gs と .html に同じ基底名が無い', function () {
  const names = fs.readdirSync(ROOT);
  const gs = names.filter(function (f) { return f.endsWith('.gs'); })
    .map(function (f) { return f.slice(0, -3); });
  const html = names.filter(function (f) { return f.endsWith('.html'); })
    .map(function (f) { return f.slice(0, -5); });
  const clash = gs.filter(function (b) { return html.indexOf(b) >= 0; });
  assert.deepStrictEqual(clash, [],
    'Apps Script はファイル名が拡張子をまたいで一意でなければならない: ' + clash.join(', '));
});

test('トップレベルの宣言名がプロジェクト全体で一意', function () {
  const seen = {};
  const dup = [];
  fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.gs'); })
    .forEach(function (file) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const re = /^(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (seen[m[1]]) dup.push(`${m[1]} (${seen[m[1]]} と ${file})`);
        else seen[m[1]] = file;
      }
    });
  assert.deepStrictEqual(dup, [],
    '.gs は全ファイルで1つのグローバルスコープを共有する: ' + dup.join(', '));
});

// ---- 結果 -------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
failures.forEach(function (f) {
  console.log(`\n  FAIL: ${f.name}\n        ${f.message}`);
});
process.exit(failures.length === 0 ? 0 : 1);
