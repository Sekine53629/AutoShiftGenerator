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
  ['○', '◯', '▲', '●'].forEach(function (s) {
    assert.ok(f.indexOf(`="${s}"`) >= 0, `出勤記号 ${s} を数える`);
  });
});

test('COUNTIF の和は記号ゼロ個のとき "=0"（"=" だけでは壊れる）', function () {
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, []), '=0');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, null), '=0');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, ['公休']),
    '=COUNTIF(B11:AF11,"公休")');
  assert.strictEqual(sandbox.buildCountifSumFormula_(11, ['○', '◯']),
    '=COUNTIF(B11:AF11,"○")+COUNTIF(B11:AF11,"◯")');
});

test('5診出勤の数式が DOC_BUSY_N を使う', function () {
  const f = sandbox.buildBusyDayFormula_(11, 31);
  assert.ok(f.indexOf(`=${sandbox.DOC_BUSY_N})`) >= 0, '混雑日のしきい値を共有定数から取る');
  assert.ok(f.indexOf('B$31:AF$31') >= 0, '医師数行を参照する');
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

// ---- 結果 -------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
failures.forEach(function (f) {
  console.log(`\n  FAIL: ${f.name}\n        ${f.message}`);
});
process.exit(failures.length === 0 ? 0 : 1);
