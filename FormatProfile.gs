/**
 * FormatProfile.gs — 運用中のシフト表から書式を吸い出し、生成に使う
 *
 * VBA 版には無い機能。仕様書 §3.1 はシートの「構造」だけを決めていて、
 * 色・行の高さ・文字サイズといった見た目は決めていない。
 * 実物に合わせて生成するために、実物から測って持っておく。
 *
 * 【位置ではなく「行の役割」で持つ】
 *   セル位置ごとに丸写しすると、スタッフが1人増えただけで全部ずれる。
 *   「日付行の背景色」「入力欄の文字サイズ」という単位なら、
 *   行数が変わっても、来年の表にもそのまま効く。
 *
 * 【値（セルの中身）は取らない】
 *   取るのは書式と、位置が決まっているラベル（集計行の見出しなど）だけ。
 *   氏名・医師名・面談日程は対象外。プロファイルはスプレッドシート上の
 *   「書式プロファイル」シートに置き、リポジトリには入れない。
 *
 * 【読み書きの約束（§8.3-3）】
 *   書式の読み出しは表示ブロックを丸ごと1回。行の高さと列幅だけは
 *   単発 API しか無いので、役割の数（9回）と列の種類（3回）に絞る。
 */

const MODULE_FORMATPROFILE = 'FormatProfile';

/**
 * メニュー「実物の書式を取り込む」。
 * いま開いているシートの書式を測り、「書式プロファイル」シートへ書く。
 */
function captureFormatProfile() {
  const started = Date.now();
  try {
    const ui = SpreadsheetApp.getUi();
    const sheet = SpreadsheetApp.getActiveSheet();

    let layout;
    try {
      layout = resolveLayout(sheet);
    } catch (ignored) {
      ui.alert([
        `シート「${sheet.getName()}」はシフト表として読めませんでした。`,
        '',
        '取り込みたい実物のシフト表を開いてから、もう一度実行してください。',
        '（B列に日付の数式が2つあり、A列に「備考」がある形が目印です）',
      ].join('\n'));
      return null;
    }

    const profile = readSheetFormat_(sheet, layout);
    writeProfileSheet_(profile, sheet.getName());
    SpreadsheetApp.flush();

    logSuccess(MODULE_FORMATPROFILE, 'captureFormatProfile',
      `from=${sheet.getName()}; keys=${Object.keys(profile).length}; `
      + `elapsedMs=${Date.now() - started}`);

    ui.alert([
      `「${sheet.getName()}」の書式を取り込みました。`,
      '',
      `「${CONFIG.SHEET_PROFILE}」シートに ${Object.keys(profile).length} 項目を書きました。`,
      '値は手で直せます。次に作るシフト表からこの書式で生成されます。',
      '',
      '※ 氏名・医師名・面談日程などセルの中身は取り込んでいません。',
    ].join('\n'));
    return profile;
  } catch (error) {
    logError(MODULE_FORMATPROFILE, 'captureFormatProfile', error, '', true);
    SpreadsheetApp.getUi().alert(`書式の取り込みに失敗しました。\n\n${error.message}`);
    throw error;
  }
}

/**
 * シートの書式を測って、キーと値の辞書にする。
 *
 * 役割ごとに「代表セル」を1つ決めて、そこの書式を役割全体の書式とみなす。
 * 代表セルは日付列の先頭（B列）。A列は氏名なので書式が違い、
 * 集計列は別の書式を持つため、どちらも代表には向かない。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 実物のシフト表
 * @param {Object} layout resolveLayout の戻り値
 * @return {Object<string,*>}
 */
function readSheetFormat_(sheet, layout) {
  const profile = {};

  // --- 書式は1回の読みで全部取る ---
  const block = sheet.getRange(1, 1, layout.shortageRow, LAYOUT.COL_KIND_WORK);
  const bg = block.getBackgrounds();
  const fg = block.getFontColors();
  const size = block.getFontSizes();
  const weight = block.getFontWeights();
  const align = block.getHorizontalAlignments();
  const numFmt = block.getNumberFormats();
  const values = block.getValues();
  const at = function (grid, row, col) { return grid[row - 1][col - 1]; };

  const roleRow = roleRowMap_(layout);
  FORMAT_PROFILE.ROLES.forEach(function (role) {
    const row = roleRow[role.key];
    const col = layout.firstCol;
    profile[`role.${role.key}.height`] = sheet.getRowHeight(row);
    profile[`role.${role.key}.bg`] = at(bg, row, col);
    profile[`role.${role.key}.fontColor`] = at(fg, row, col);
    profile[`role.${role.key}.fontSize`] = at(size, row, col);
    profile[`role.${role.key}.bold`] = at(weight, row, col) === 'bold';
    profile[`role.${role.key}.hAlign`] = at(align, row, col);
  });

  // --- 列幅。日付列と集計列は代表を1つずつ取る ---
  profile['col.name.width'] = sheet.getColumnWidth(1);
  profile['col.day.width'] = sheet.getColumnWidth(layout.firstCol);
  profile['col.agg.width'] = sheet.getColumnWidth(LAYOUT.COL_AGG_FIRST);

  // --- 曜日ごとの色。実物の日付行から、その曜日の列を探して拾う ---
  const dayColors = readWeekdayColors_(sheet, layout, bg, fg, values);
  Object.keys(dayColors).forEach(function (key) { profile[key] = dayColors[key]; });

  // --- 表示形式 ---
  profile['format.date'] = at(numFmt, layout.dateRow, layout.firstCol);
  profile['format.month'] = at(numFmt, layout.headerRow, 1);

  // --- ラベル（位置が決まっているものだけ。氏名や医師名は取らない） ---
  profile['label.doc'] = labelOrDefault_(at(values, layout.docRow, 1), 'label.doc');
  profile['label.pharm'] = labelOrDefault_(at(values, layout.pharmRow, 1), 'label.pharm');
  profile['label.shortage'] = labelOrDefault_(at(values, layout.shortageRow, 1), 'label.shortage');
  profile['label.note'] = labelOrDefault_(at(values, layout.noteRow, 1), 'label.note');

  const aggHeads = [];
  for (let c = LAYOUT.COL_AGG_FIRST; c <= LAYOUT.COL_AGG_LAST; c++) {
    aggHeads.push(String(at(values, layout.repeatDateRow, c) || '').trim());
  }
  if (aggHeads.some(function (h) { return h !== ''; })) {
    profile['label.agg'] = aggHeads.join(',');
  }

  return profile;
}

/**
 * 役割 → 代表行の対応。
 * 自由行は「医師名欄の1行下」で、Layout は名前を持っていないのでここで決める。
 */
function roleRowMap_(layout) {
  return {
    header: layout.headerRow,
    date: layout.dateRow,
    week: layout.weekRow,
    doctor: layout.doctorTop,
    free: layout.doctorBottom + 1,
    repeatDate: layout.repeatDateRow,
    grid: layout.gridTop,
    note: layout.noteRow,
    total: layout.docRow,
  };
}

/**
 * 土曜・日曜・月外の色を、日付行から実際にその曜日の列を探して拾う。
 *
 * 月によって曜日の並びが変わるので、列位置を決め打ちにはできない。
 * 見つからない曜日は既定値のまま（プロファイルに書かない）。
 */
function readWeekdayColors_(sheet, layout, bg, fg, values) {
  const out = {};
  const monthValue = values[layout.headerRow - 1][0];
  const targetMonth = (monthValue instanceof Date) ? monthValue.getMonth() : -1;

  for (let c = layout.firstCol; c <= layout.lastCol; c++) {
    const date = values[layout.dateRow - 1][c - 1];
    if (!(date instanceof Date)) continue;

    const cellBg = bg[layout.dateRow - 1][c - 1];
    if (targetMonth >= 0 && date.getMonth() !== targetMonth) {
      if (!out['day.outMonthBg']) {
        out['day.outMonthBg'] = cellBg;
        out['day.outMonthFg'] = fg[layout.dateRow - 1][c - 1];
      }
      continue;
    }
    if (date.getDay() === 6 && !out['day.satBg']) out['day.satBg'] = cellBg;
    if (date.getDay() === 0 && !out['day.sunBg']) out['day.sunBg'] = cellBg;
  }
  return out;
}

/** ラベルが空なら既定値を使う。手で変えた見出しは尊重する。 */
function labelOrDefault_(value, key) {
  const v = String(value == null ? '' : value).trim();
  return v === '' ? FORMAT_DEFAULT[key] : v;
}

/**
 * プロファイルをシートへ書く。既存の行は値だけ更新し、無いキーは追記する。
 * 利用者が手で直した値を消さないため、キーで突き合わせる。
 */
function writeProfileSheet_(profile, sourceName) {
  const got = getOrAddSheet_(CONFIG.SHEET_PROFILE);
  const sheet = got.sheet;

  setIfBlank_(sheet.getRange(FORMAT_PROFILE.HDR_ROW, FORMAT_PROFILE.COL_KEY, 1, 3),
    [FORMAT_PROFILE.HEADS]);
  styleHeaderRange_(sheet.getRange(FORMAT_PROFILE.HDR_ROW, FORMAT_PROFILE.COL_KEY, 1, 3));

  const rows = Object.keys(profile).sort().map(function (key) {
    return [key, profile[key], describeProfileKey_(key)];
  });
  rows.push(['(取り込み元)', sourceName, `${new Date().toLocaleString('ja-JP')} に取り込み`]);

  const last = sheet.getLastRow();
  if (last >= FORMAT_PROFILE.FIRST_ROW) {
    sheet.getRange(FORMAT_PROFILE.FIRST_ROW, FORMAT_PROFILE.COL_KEY,
      last - FORMAT_PROFILE.FIRST_ROW + 1, 3).clearContent();
  }
  sheet.getRange(FORMAT_PROFILE.FIRST_ROW, FORMAT_PROFILE.COL_KEY, rows.length, 3)
    .setValues(rows);

  if (got.created) {
    sheet.setColumnWidth(FORMAT_PROFILE.COL_KEY, 210);
    sheet.setColumnWidth(FORMAT_PROFILE.COL_VALUE, 130);
    sheet.setColumnWidth(FORMAT_PROFILE.COL_NOTE, 320);
    sheet.setFrozenRows(FORMAT_PROFILE.HDR_ROW);
  }
}

/** キーの意味を日本語で返す。プロファイルシートを人が読めるようにするため。 */
function describeProfileKey_(key) {
  const parts = key.split('.');
  if (parts[0] === 'role') {
    const role = FORMAT_PROFILE.ROLES.filter(function (r) { return r.key === parts[1]; })[0];
    const attr = FORMAT_PROFILE.ATTRS.filter(function (a) { return a.key === parts[2]; })[0];
    if (role && attr) return `${role.label} の ${attr.label}`;
  }
  const fixed = {
    'col.name.width': '氏名列（A）の幅',
    'col.day.width': '日付列（B〜AF）の幅',
    'col.agg.width': '集計列（AH〜AM）の幅',
    'day.satBg': '土曜の背景色',
    'day.sunBg': '日曜・祝日の背景色',
    'day.outMonthBg': '月外の日の背景色',
    'day.outMonthFg': '月外の日の文字色',
    'format.date': '日付の表示形式',
    'format.month': '年月セルの表示形式',
    'label.doc': '集計行 A列の見出し（医師数）',
    'label.pharm': '集計行 A列の見出し（薬剤師出勤数）',
    'label.shortage': '集計行 A列の見出し（過不足）',
    'label.note': '備考行 A列の見出し',
    'label.doctors': '医師名欄 A列の見出し',
    'label.agg': '集計列の見出し（カンマ区切り6個）',
    'sheet.borderColor': '罫線の色',
    'sheet.leaveBg': '休業者の行に塗る色',
  };
  return fixed[key] || '';
}

/**
 * 書式プロファイルを読む。既定値に、シートの値を上書きして返す。
 * シートが無くても既定値で必ず動く（実物を取り込む前でもシートは作れる）。
 * @return {Object<string,*>}
 */
function loadFormatProfile() {
  const profile = {};
  Object.keys(FORMAT_DEFAULT).forEach(function (key) { profile[key] = FORMAT_DEFAULT[key]; });

  try {
    const sheet = getSheetOrNull(CONFIG.SHEET_PROFILE);
    if (!sheet) return profile;
    const last = sheet.getLastRow();
    if (last < FORMAT_PROFILE.FIRST_ROW) return profile;

    const rows = sheet.getRange(FORMAT_PROFILE.FIRST_ROW, FORMAT_PROFILE.COL_KEY,
      last - FORMAT_PROFILE.FIRST_ROW + 1, 2).getValues();
    return mergeProfileRows_(profile, rows);
  } catch (error) {
    logError(MODULE_FORMATPROFILE, 'loadFormatProfile', error, '');
    return profile;   // 読めなくても既定値で動かす
  }
}

/**
 * プロファイルシートの行を既定値へ重ねる。SpreadsheetApp を呼ばない純粋関数。
 *
 * 既定値に無いキーは捨てる（打ち間違いや古いキーが混ざっても壊れないため）。
 * 空欄も捨てる（消しただけで既定値に戻る、という直感に合わせる）。
 *
 * @param {Object<string,*>} defaults 既定値（破壊せず複製して返す）
 * @param {Array<Array<*>>} rows [[キー, 値], ...]
 * @return {Object<string,*>}
 */
function mergeProfileRows_(defaults, rows) {
  const out = {};
  Object.keys(defaults).forEach(function (key) { out[key] = defaults[key]; });

  (rows || []).forEach(function (row) {
    const key = String(row[0] == null ? '' : row[0]).trim();
    if (!Object.prototype.hasOwnProperty.call(out, key)) return;

    const raw = row[1];
    if (raw === null || raw === undefined || String(raw).trim() === '') return;

    out[key] = coerceProfileValue_(out[key], raw);
  });
  return out;
}

/**
 * シートから読んだ値を、既定値と同じ型に揃える。
 * シートは数値も真偽値も文字列で返しうるので、型が混ざると
 * setFontSize に文字列を渡すような失敗になる。
 */
function coerceProfileValue_(defaultValue, raw) {
  if (typeof defaultValue === 'number') {
    const n = Number(raw);
    return isNaN(n) ? defaultValue : n;
  }
  if (typeof defaultValue === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    const t = String(raw).trim().toLowerCase();
    if (['true', '1', 'はい', 'yes', '○'].indexOf(t) >= 0) return true;
    if (['false', '0', 'いいえ', 'no', '×', ''].indexOf(t) >= 0) return false;
    return defaultValue;
  }
  return String(raw);
}

/**
 * 役割の書式をまとめて取り出す。SheetBuilder が範囲へ当てるときに使う。
 * @param {Object<string,*>} profile loadFormatProfile の戻り値
 * @param {string} role 役割のキー
 * @return {{height:number, bg:string, fontColor:string, fontSize:number,
 *           bold:boolean, hAlign:string}}
 */
function roleFormat(profile, role) {
  return {
    height: profile[`role.${role}.height`],
    bg: profile[`role.${role}.bg`],
    fontColor: profile[`role.${role}.fontColor`],
    fontSize: profile[`role.${role}.fontSize`],
    bold: profile[`role.${role}.bold`],
    hAlign: profile[`role.${role}.hAlign`],
  };
}

/**
 * 役割の書式を範囲へ当てる。書式ごとに setXxx を1回ずつ呼ぶ（範囲まるごと）。
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 対象シート
 * @param {number} row 行
 * @param {Object} fmt roleFormat の戻り値
 * @param {number} firstCol 先頭列
 * @param {number} numCols 列数
 */
function applyRoleFormat_(sheet, row, fmt, firstCol, numCols) {
  sheet.setRowHeight(row, fmt.height);
  sheet.getRange(row, firstCol, 1, numCols)
    .setBackground(fmt.bg)
    .setFontColor(fmt.fontColor)
    .setFontSize(fmt.fontSize)
    .setFontWeight(fmt.bold ? 'bold' : 'normal')
    .setHorizontalAlignment(fmt.hAlign);
}
