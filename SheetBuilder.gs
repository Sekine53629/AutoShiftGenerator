/**
 * SheetBuilder.gs — シフト表シートを1から生成する
 *
 * 【これは移植ではない。GAS 版で新しく足した機能】
 *   VBA 版は既存の Excel ブックが前提で、シフトシート自体を作る手段が無かった
 *   （ShiftSetup は既に在るシートに数式を当てるだけ）。
 *   Sheets 版は空のスプレッドシートから始められるようにする。
 *
 * 仕様書: §3.1（シートのスキーマ）/ §5（数式）/ §5.4（集計行・集計列）
 *
 * 【生成する行構成】パレット3行を作らないので VBA 版より3行上にずれる。
 *   位置はすべて「B列の日付数式」から相対で解決するため、ずれてもコードは動く。
 *
 *    1行  年月・タイトル行   A=年月 / D=タイトル / I=祝日サマリー / AG=年月シリアル
 *    2行  日付行（数式）     ← Layout の基準セル
 *    3行  曜日行
 *    4-8行 医師名欄（DOC_BLOCK_ROWS = 5）
 *    9行  自由行（発注担当などの手書き用。マクロは読まない）
 *   10行  日付の再掲        + AH〜AM に集計列の見出し
 *   11行〜 スタッフ入力欄
 *    …    空行
 *         備考行
 *    …    空行
 *         医師数(診) / 薬剤師出勤数 / 過不足
 *
 * 【実名を書かない】
 *   氏名は自動作成設定シートから読むだけ。無ければ空行を用意する。
 *   医師名欄も空で作る（候補は 自動作成設定 の N 列が正。§6.4）。
 */

const MODULE_SHEETBUILDER = 'SheetBuilder';

/**
 * メニュー「シフト表シートを生成」。対象の年月を尋ねてから作る。
 */
function createMonthlyShiftSheet() {
  try {
    const ui = SpreadsheetApp.getUi();
    const today = new Date();
    const defaultText = Utilities.formatDate(today, CONFIG.TIMEZONE_HINT, 'yyyy/M');
    const res = ui.prompt(
      'シフト表シートを生成',
      `対象の年月を「yyyy/m」で入力してください（例 ${defaultText}）。`,
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() !== ui.Button.OK) return;

    const parsed = parseYearMonth_(res.getResponseText());
    if (!parsed) {
      ui.alert('「2026/9」のような形式で入力してください。');
      return;
    }

    const sheet = buildShiftSheet(parsed.year, parsed.month);
    SpreadsheetApp.getActive().setActiveSheet(sheet);
    ui.alert(`シート「${sheet.getName()}」を作りました。\n\n`
      + '氏名欄・医師名欄は空です。自動作成設定シートにメンバーを登録してから\n'
      + '「シフト自動作成」を実行してください。');
  } catch (error) {
    logError(MODULE_SHEETBUILDER, 'createMonthlyShiftSheet', error, '', true);
    SpreadsheetApp.getUi().alert(`シートの生成に失敗しました。\n\n${error.message}`);
  }
}

/**
 * 指定の年月のシフト表シートを作る。
 *
 * @param {number} year 西暦
 * @param {number} month 1〜12
 * @param {{sheetName:string=, staffNames:string[]=}=} options
 * @return {GoogleAppsScript.Spreadsheet.Sheet} 作ったシート
 */
function buildShiftSheet(year, month, options) {
  const started = Date.now();
  try {
    const opts = options || {};
    const ss = SpreadsheetApp.getActive();

    const monthDate = new Date(year, month - 1, 1);
    const sheetName = opts.sheetName
      || Utilities.formatDate(monthDate, CONFIG.TIMEZONE_HINT, SHEET_BUILD.MONTH_SHEET_FORMAT);
    if (ss.getSheetByName(sheetName)) {
      throw new Error(`シート「${sheetName}」は既にあります。作り直すなら先に削除するか、別名を指定してください。`);
    }

    const staffNames = opts.staffNames || readMemberNames();
    const staffRows = staffNames.length > 0
      ? staffNames.length + SHEET_BUILD.SPARE_STAFF_ROWS
      : SHEET_BUILD.DEFAULT_STAFF_ROWS;

    const pos = planSheetPositions_(staffRows);
    const sheet = ss.insertSheet(sheetName);

    writeHeaderBlock_(sheet, pos, year, month);
    writeDateRows_(sheet, pos);
    writeStaffColumn_(sheet, pos, staffNames);
    writeAggregateRows_(sheet, pos);
    writeAggregateColumns_(sheet, pos);
    applySheetFormatting_(sheet, pos);
    applyDayConditionalFormats_(sheet, pos);
    applyNamedRangesIfCanonical_(sheet, pos, sheetName);

    SpreadsheetApp.flush();
    logSuccess(MODULE_SHEETBUILDER, 'buildShiftSheet',
      `sheet=${sheetName}; staffRows=${staffRows}; gridTop=${pos.gridTop}; `
      + `gridBottom=${pos.gridBottom}; elapsedMs=${Date.now() - started}`);
    return sheet;
  } catch (error) {
    logError(MODULE_SHEETBUILDER, 'buildShiftSheet', error, `year=${year}; month=${month}`);
    throw error;
  }
}

/**
 * 行位置を決める。Layout の解決規則（DOC_GAP / NOTE_TO_DOC / NOTE_GAP …）と
 * 必ず辻褄が合うようにすること。生成した直後に resolveLayout() が同じ値を
 * 返さなければ、そのシートは自動作成に使えない。
 * @param {number} staffRows スタッフ入力欄の行数
 */
function planSheetPositions_(staffRows) {
  const headerRow = 1;
  const dateRow = headerRow + 1;
  const weekRow = dateRow + 1;
  const doctorTop = weekRow + 1;
  const doctorBottom = doctorTop + LAYOUT.DOC_BLOCK_ROWS - 1;
  const freeRow = doctorBottom + 1;                        // 自由行（VBA 版の「空行」）
  const repeatDateRow = freeRow + 1;
  const gridTop = repeatDateRow + LAYOUT.DATE_REPEAT_GAP;
  const gridBottom = gridTop + staffRows - 1;
  const noteRow = gridBottom + LAYOUT.NOTE_GAP;
  const docRow = noteRow + LAYOUT.NOTE_TO_DOC;             // = gridBottom + DOC_GAP

  return {
    headerRow: headerRow,
    dateRow: dateRow,
    weekRow: weekRow,
    doctorTop: doctorTop,
    doctorBottom: doctorBottom,
    freeRow: freeRow,
    repeatDateRow: repeatDateRow,
    gridTop: gridTop,
    gridBottom: gridBottom,
    noteRow: noteRow,
    docRow: docRow,
    pharmRow: docRow + 1,
    shortageRow: docRow + 2,
    firstCol: LAYOUT.COL_FIRST,
    lastCol: LAYOUT.COL_LAST,
    dayCount: LAYOUT.COL_LAST - LAYOUT.COL_FIRST + 1,
  };
}

/**
 * 年月・タイトル・祝日サマリー・年月シリアルを書く。
 *
 * 【和暦について（§5.2）】
 *   Sheets に和暦のカスタム表示形式は無い。年月セル A は西暦で持ち、
 *   実物のシフト表が使っている「R8.9月」の見た目は D セルに数式で組む。
 *   **元号が変わると数式を直す必要がある**（-2018 が令和固有のため）。
 */
function writeHeaderBlock_(sheet, pos, year, month) {
  const h = pos.headerRow;
  const monthSerial = (year - 1900) * 12 + month;

  sheet.getRange(h, LAYOUT.COL_MONTH).setValue(monthSerial);
  sheet.getRange(h, 1)
    .setFormula(`=DATE(1900,${toColumnLetter(LAYOUT.COL_MONTH)}${h},1)`)
    .setNumberFormat('yyyy"年"m"月"');

  // 和暦の見出し（令和のみ。元号が変わったらここを直す）
  sheet.getRange(h, 4).setFormula(`="R"&(YEAR(A${h})-2018)&"."&MONTH(A${h})&"月"`);

  const first = toColumnLetter(pos.firstCol);
  const last = toColumnLetter(pos.lastCol);
  sheet.getRange(h, 9).setFormula(
    `=LET(d,${first}${pos.dateRow}:${last}${pos.dateRow},`
    + `inM,--(MONTH(d)=MONTH(A${h})),`
    + `wk,SUMPRODUCT(inM*(WEEKDAY(d,2)>5)),`
    + `hol,SUMPRODUCT(inM*(WEEKDAY(d,2)<6)*COUNTIF(${CONFIG.SHEET_HOLIDAY}!$A:$A,d)),`
    + `"土日公休"&wk&"回　祝日"&hol&"回　公休ノルマ"&(wk+hol)&"日")`
  );
}

/**
 * 日付行・曜日行・再掲日付行を書く。
 * B 列の先頭だけは必ず「数式かつ日付」にすること。Layout がこれを基準にする。
 */
function writeDateRows_(sheet, pos) {
  const dates = [];
  const weeks = [];
  const repeats = [];
  for (let c = pos.firstCol; c <= pos.lastCol; c++) {
    const col = toColumnLetter(c);
    const prev = toColumnLetter(c - 1);
    dates.push(c === pos.firstCol
      ? `=A${pos.headerRow}`
      : `=${prev}${pos.dateRow}+1`);
    weeks.push(`=TEXT(${col}${pos.dateRow},"aaa")`);
    repeats.push(`=${col}${pos.dateRow}`);
  }

  sheet.getRange(pos.dateRow, pos.firstCol, 1, pos.dayCount)
    .setFormulas([dates]).setNumberFormat('d');
  sheet.getRange(pos.weekRow, pos.firstCol, 1, pos.dayCount)
    .setFormulas([weeks]);
  sheet.getRange(pos.repeatDateRow, pos.firstCol, 1, pos.dayCount)
    .setFormulas([repeats]).setNumberFormat('d');
}

/**
 * A 列の氏名とラベルを書く。氏名は自動作成設定から来たものだけ。
 * 予備行は空のままにする（派遣の自由記入などに使う）。
 */
function writeStaffColumn_(sheet, pos, staffNames) {
  const rows = pos.gridBottom - pos.gridTop + 1;
  const names = [];
  for (let i = 0; i < rows; i++) {
    names.push([i < staffNames.length ? staffNames[i] : '']);
  }
  sheet.getRange(pos.gridTop, 1, rows, 1).setValues(names);
  sheet.getRange(pos.noteRow, 1).setValue(LABEL.NOTE);
}

/**
 * 集計行（医師数(診) / 薬剤師出勤数 / 過不足）を B〜AF に書く。
 * 薬剤師出勤数は §5.3 の作業列方式（MATCH に配列を渡さない）。
 */
function writeAggregateRows_(sheet, pos) {
  const docF = [];
  const pharmF = [];
  const shortF = [];
  const reqPlus = `IFERROR(INDEX(${CONFIG.SHEET_CFG}!$L:$L,`
    + `MATCH("${SETTING_DEFAULT.reqPlus.matchKey}*",${CONFIG.SHEET_CFG}!$K:$K,0)),`
    + `${SETTING_DEFAULT.reqPlus.value})`;

  for (let c = pos.firstCol; c <= pos.lastCol; c++) {
    const col = toColumnLetter(c);
    docF.push(`=COUNTA(${col}${pos.doctorTop}:${col}${pos.doctorBottom})`);
    pharmF.push(buildPharmCountFormula_(col, pos.gridTop, pos.gridBottom));
    shortF.push(`=${col}${pos.pharmRow}-(${col}${pos.docRow}+${reqPlus})`);
  }

  sheet.getRange(pos.docRow, 1).setValue(SHEET_BUILD.ROW_HEAD_DOC);
  sheet.getRange(pos.pharmRow, 1).setValue(SHEET_BUILD.ROW_HEAD_PHARM);
  sheet.getRange(pos.shortageRow, 1).setValue(SHEET_BUILD.ROW_HEAD_SHORTAGE);

  sheet.getRange(pos.docRow, pos.firstCol, 1, pos.dayCount).setFormulas([docF]);
  sheet.getRange(pos.pharmRow, pos.firstCol, 1, pos.dayCount).setFormulas([pharmF]);
  sheet.getRange(pos.shortageRow, pos.firstCol, 1, pos.dayCount).setFormulas([shortF]);
}

/**
 * 集計列（AH〜AM）と区分の作業列（AN）を書く。
 *
 *   AH 公休   … ノルマ対象の休み記号
 *   AI 有休   … ノルマ外の休み記号（設定 L11 の部分一致で振り分ける）
 *   AJ ○早番 / AK ▲遅番 / AL ●遅半 / AM 5診出勤
 *   AN        … 区分の作業列（§5.3）。非表示にする
 */
function writeAggregateColumns_(sheet, pos) {
  const cfgPairs = readSettingPairs();
  const paidSyms = readSettingText_(cfgPairs, 'paidSyms');
  const quotaSyms = splitOffSymbolsByQuota_(paidSyms, true);
  const paidOffSyms = splitOffSymbolsByQuota_(paidSyms, false);

  const rows = pos.gridBottom - pos.gridTop + 1;
  const aggWidth = LAYOUT.COL_AGG_LAST - LAYOUT.COL_AGG_FIRST + 1;
  const agg = [];
  const kind = [];

  for (let r = pos.gridTop; r <= pos.gridBottom; r++) {
    agg.push([
      buildCountifSumFormula_(r, quotaSyms),
      buildCountifSumFormula_(r, paidOffSyms),
      buildCountifSumFormula_(r, [SYM.EARLY, SYM.EARLY_ALT]),
      buildCountifSumFormula_(r, [SYM.LATE]),
      buildCountifSumFormula_(r, [SYM.MID]),
      buildBusyDayFormula_(r, pos.docRow),
    ]);
    kind.push([
      `=IFERROR(INDEX(${CONFIG.SHEET_CFG}!$B:$B,`
      + `MATCH($A${r},${CONFIG.SHEET_CFG}!$A:$A,0)),"")`,
    ]);
  }

  sheet.getRange(pos.repeatDateRow, LAYOUT.COL_AGG_FIRST, 1, aggWidth)
    .setValues([SHEET_BUILD.AGG_HEADS])
    .setFontWeight('bold')
    .setBackground(SHEET_BUILD.COLOR_HEADER_BG)
    .setHorizontalAlignment('center');

  sheet.getRange(pos.gridTop, LAYOUT.COL_AGG_FIRST, rows, aggWidth).setFormulas(agg);
  sheet.getRange(pos.gridTop, LAYOUT.COL_KIND_WORK, rows, 1).setFormulas(kind);
  sheet.hideColumns(LAYOUT.COL_MONTH);
  sheet.hideColumns(LAYOUT.COL_KIND_WORK);
}

/** 列幅・罫線・固定行・配置などの体裁を整える。 */
function applySheetFormatting_(sheet, pos) {
  sheet.setColumnWidth(1, SHEET_BUILD.COL_WIDTH_NAME);
  sheet.setColumnWidths(pos.firstCol, pos.dayCount, SHEET_BUILD.COL_WIDTH_DAY);
  sheet.setColumnWidths(LAYOUT.COL_AGG_FIRST,
    LAYOUT.COL_AGG_LAST - LAYOUT.COL_AGG_FIRST + 1, SHEET_BUILD.COL_WIDTH_AGG);

  const headerRows = [pos.dateRow, pos.weekRow, pos.repeatDateRow];
  headerRows.forEach(function (r) {
    sheet.getRange(r, pos.firstCol, 1, pos.dayCount)
      .setFontWeight('bold')
      .setBackground(SHEET_BUILD.COLOR_HEADER_BG)
      .setHorizontalAlignment('center');
  });

  sheet.getRange(pos.gridTop, pos.firstCol, pos.gridBottom - pos.gridTop + 1, pos.dayCount)
    .setHorizontalAlignment('center');

  [pos.docRow, pos.pharmRow, pos.shortageRow].forEach(function (r) {
    sheet.getRange(r, 1, 1, pos.lastCol).setBackground(SHEET_BUILD.COLOR_HEADER_BG);
    sheet.getRange(r, pos.firstCol, 1, pos.dayCount).setHorizontalAlignment('center');
  });

  sheet.getRange(pos.dateRow, 1, pos.shortageRow - pos.dateRow + 1, pos.lastCol)
    .setBorder(true, true, true, true, true, true,
      SHEET_BUILD.COLOR_BORDER, SpreadsheetApp.BorderStyle.SOLID);

  sheet.setFrozenRows(pos.weekRow);
  sheet.setFrozenColumns(1);
}

/**
 * 日付の条件付き書式（土 / 日・祝 / 月外）。
 *
 * 【Sheets の落とし穴】
 *   条件付き書式のカスタム数式から他シートを直接参照できない。
 *   祝日マスタを見るには INDIRECT で包む必要がある。
 *   直接書くと「無効な数式」ではなく、静かに一度も一致しなくなる。
 */
function applyDayConditionalFormats_(sheet, pos) {
  const first = toColumnLetter(pos.firstCol);
  const h = pos.headerRow;
  const d = pos.dateRow;

  const headerRange = sheet.getRange(d, pos.firstCol, pos.weekRow - d + 1, pos.dayCount);
  const wholeRange = sheet.getRange(d, pos.firstCol,
    pos.shortageRow - d + 1, pos.dayCount);

  const rules = [
    // 月外の日は先に灰色で潰す（順序が先のルールが勝つ）
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=MONTH(${first}$${d})<>MONTH($A$${h})`)
      .setBackground(SHEET_BUILD.COLOR_OUT_MONTH_BG)
      .setFontColor('#999999')
      .setRanges([wholeRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        `=OR(WEEKDAY(${first}$${d})=1,`
        + `COUNTIF(INDIRECT("${CONFIG.SHEET_HOLIDAY}!$A:$A"),${first}$${d})>0)`)
      .setBackground(SHEET_BUILD.COLOR_SUN_BG)
      .setRanges([headerRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=WEEKDAY(${first}$${d})=7`)
      .setBackground(SHEET_BUILD.COLOR_SAT_BG)
      .setRanges([headerRange])
      .build(),
  ];

  sheet.setConditionalFormatRules(rules);
}

/**
 * 名前付き範囲を貼る。
 *
 * 【月ごとにシートを分けるときは貼らない】
 *   名前付き範囲の名前はスプレッドシート全体で一意なので、
 *   12 か月分のシートに同じ「シフト入力範囲」を付けることはできない。
 *   Layout の計算解決を正としているため、名前が無くても自動作成は動く（§5.5）。
 *   正典の「シフト」シートを作ったときだけ、利用者向けの目印として貼る。
 */
function applyNamedRangesIfCanonical_(sheet, pos, sheetName) {
  if (sheetName !== CONFIG.SHEET_SHIFT) {
    console.log(`[${MODULE_SHEETBUILDER}] 「${sheetName}」は月別シートのため名前付き範囲は貼りません`
      + '（名前はブック全体で一意のため）。位置は Layout が計算で解決します。');
    return;
  }
  const ss = SpreadsheetApp.getActive();
  const existing = ss.getNamedRanges().map(function (nr) { return nr.getName(); });
  NAMED_RANGE.OBSOLETE.forEach(function (name) {
    if (existing.indexOf(name) >= 0) ss.removeNamedRange(name);
  });
  ss.setNamedRange(NAMED_RANGE.SHIFT,
    sheet.getRange(pos.gridTop, pos.firstCol,
      pos.gridBottom - pos.gridTop + 1, pos.dayCount));
  ss.setNamedRange(NAMED_RANGE.DOCLIST,
    sheet.getRange(pos.doctorTop, pos.firstCol,
      pos.doctorBottom - pos.doctorTop + 1, pos.dayCount));
  ss.setNamedRange(NAMED_RANGE.NOTEROW,
    sheet.getRange(pos.noteRow, pos.firstCol, 1, pos.dayCount));
}

/**
 * 「yyyy/m」「yyyy-m」「yyyy年m月」を年月に読み解く。
 * @return {{year:number, month:number}|null}
 */
function parseYearMonth_(text) {
  const m = String(text || '').match(/(\d{4})\s*[\/\-年.]\s*(\d{1,2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: year, month: month };
}
