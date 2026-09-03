/**
 * Schema.gs — 不足シートの生成
 *
 * 移植元: ShiftSchema.bas（祝日の取込は Holidays.gs へ分離）
 * 仕様書: §3.3 / §3.4 / §6.4
 *
 * 【生成の約束】
 *   空欄のセルにしか書かない。既存の値は絶対に消さない（VBA の SC_SetIfBlank と同じ）。
 *   すでに運用しているブックに対して何度実行しても壊れないこと、が唯一の要件。
 *
 * 【なぜ手作業ではだめか】
 *   自動作成設定は列の位置が固定で、A=氏名 / B=区分 がずれると
 *   区分の作業列（AN）が照合に失敗し、薬剤師出勤数が黙って 0 になる。
 *   エラーにならないので気づきにくい。だから生成をコードに寄せる。
 */

const MODULE_SCHEMA = 'Schema';

/**
 * メニュー「不足シートを生成」。
 * 自動作成設定 / 祝日マスタ / シフト変更ログ のうち、無いものだけ作る。
 * すでにあるシートには見出しと入力規則を補うだけで、データには触らない。
 */
function buildMissingSheets() {
  const started = Date.now();
  try {
    const report = [
      buildConfigSheet(),
      buildHolidaySheet(),
      buildChangeLogSheet(),
    ];
    SpreadsheetApp.flush();

    const lines = report.map(function (r) {
      return `・${r.name}: ${r.created ? '作りました' : 'すでにあります（見出しだけ補いました）'}`;
    });
    const createdCount = report.filter(function (r) { return r.created; }).length;

    logSuccess(MODULE_SCHEMA, 'buildMissingSheets',
      `created=${createdCount}/${report.length}; elapsedMs=${Date.now() - started}`);

    SpreadsheetApp.getUi().alert([
      'シートの確認が終わりました。',
      '',
    ].concat(lines).concat([
      '',
      '次は「自動作成設定」にメンバーを登録してください。',
      'A列=氏名（シフト表と完全一致）/ B列=区分（薬剤師 か 事務員）が要ります。',
      '祝日は「初期設定 → 祝日マスタを取り込む」で入ります。',
    ]).join('\n'));

    return report;
  } catch (error) {
    logError(MODULE_SCHEMA, 'buildMissingSheets', error, '', true);
    SpreadsheetApp.getUi().alert(`シートの生成に失敗しました。\n\n${error.message}`);
    throw error;
  }
}

/**
 * 自動作成設定シートを作る。
 *   メンバー表（見出し4行目 / 5行目〜）
 *   + 全体設定（K=ラベル / L=値。既定値を空欄のときだけ入れる）
 *   + 医師名リスト（N 列。§6.4。VBA 版がパレットに持っていた医師名の置き場）
 *
 * @return {{name:string, created:boolean}}
 */
function buildConfigSheet() {
  try {
    const got = getOrAddSheet_(CONFIG.SHEET_CFG);
    const sheet = got.sheet;

    // --- メンバー表の見出し（A〜I） ---
    const memberHeads = SCHEMA.CFG_MEMBER_HEADS;
    setIfBlank_(sheet.getRange(CFG_MEMBER.HDR_ROW, CFG_MEMBER.COL_NAME, 1, memberHeads.length),
      [memberHeads]);
    styleHeaderRange_(sheet.getRange(CFG_MEMBER.HDR_ROW, CFG_MEMBER.COL_NAME,
      1, memberHeads.length));

    // --- 全体設定（K=ラベル / L=値） ---
    setIfBlank_(sheet.getRange(CFG_SETTING.ROW, CFG_SETTING.COL_KEY, 1, 2),
      [SCHEMA.CFG_SETTING_HEADS]);
    styleHeaderRange_(sheet.getRange(CFG_SETTING.ROW, CFG_SETTING.COL_KEY, 1, 2));

    const keys = Object.keys(SETTING_DEFAULT);
    const settingRows = keys.map(function (key) {
      return [SETTING_DEFAULT[key].label, SETTING_DEFAULT[key].value];
    });
    setIfBlank_(sheet.getRange(CFG_SETTING.ROW + 1, CFG_SETTING.COL_KEY,
      settingRows.length, 2), settingRows);

    // --- 医師名リスト（N） ---
    setIfBlank_(sheet.getRange(CFG_SETTING.ROW, CFG_SETTING.COL_DOCTOR),
      [[SCHEMA.CFG_DOCTOR_HEAD]]);
    styleHeaderRange_(sheet.getRange(CFG_SETTING.ROW, CFG_SETTING.COL_DOCTOR));

    // --- 入力規則。打ち間違いをここで止める ---
    addColumnValidation_(sheet, CFG_MEMBER.COL_KIND, [KIND.PHARM, KIND.CLERK]);
    addColumnValidation_(sheet, CFG_MEMBER.COL_CLOSED, SCHEMA.CHOICE_CLOSED);
    addColumnValidation_(sheet, CFG_MEMBER.COL_RULE,
      [RULE.NORMAL, RULE.FIXED_DOW, RULE.WEEK_N, RULE.MANUAL]);
    addColumnValidation_(sheet, CFG_MEMBER.COL_LATE, SCHEMA.CHOICE_LATE);

    if (got.created) {
      sheet.setColumnWidth(CFG_MEMBER.COL_NAME, 120);
      sheet.setColumnWidth(CFG_SETTING.COL_KEY, 240);
      sheet.setColumnWidth(CFG_SETTING.COL_DOCTOR, 120);
      sheet.setFrozenRows(CFG_MEMBER.HDR_ROW);
    }

    logSuccess(MODULE_SCHEMA, 'buildConfigSheet',
      `sheet=${CONFIG.SHEET_CFG}; created=${got.created}; settings=${settingRows.length}`);
    return { name: CONFIG.SHEET_CFG, created: got.created };
  } catch (error) {
    logError(MODULE_SCHEMA, 'buildConfigSheet', error, '');
    throw error;
  }
}

/**
 * 祝日マスタシートを作る（見出しだけ。データの取込は Holidays.gs）。
 * @return {{name:string, created:boolean, sheet:GoogleAppsScript.Spreadsheet.Sheet}}
 */
function buildHolidaySheet() {
  try {
    const got = getOrAddSheet_(CONFIG.SHEET_HOLIDAY);
    const sheet = got.sheet;

    setIfBlank_(sheet.getRange(HOLIDAY_SHEET.HDR_ROW, HOLIDAY_SHEET.COL_DATE, 1, 2),
      [SCHEMA.HOLIDAY_HEADS]);
    styleHeaderRange_(sheet.getRange(HOLIDAY_SHEET.HDR_ROW, HOLIDAY_SHEET.COL_DATE, 1, 2));

    if (got.created) {
      // 日付列は必ず日付型で持つ。文字列だと COUNTIF が一致せず、
      // 祝日サマリーも条件付き書式も静かに 0 件になる
      sheet.getRange(HOLIDAY_SHEET.FIRST_ROW, HOLIDAY_SHEET.COL_DATE,
        sheet.getMaxRows() - HOLIDAY_SHEET.FIRST_ROW + 1, 1)
        .setNumberFormat('yyyy/mm/dd');
      sheet.setColumnWidth(HOLIDAY_SHEET.COL_DATE, 110);
      sheet.setColumnWidth(HOLIDAY_SHEET.COL_NAME, 180);
      sheet.setFrozenRows(HOLIDAY_SHEET.HDR_ROW);
    }

    logSuccess(MODULE_SCHEMA, 'buildHolidaySheet',
      `sheet=${CONFIG.SHEET_HOLIDAY}; created=${got.created}`);
    return { name: CONFIG.SHEET_HOLIDAY, created: got.created, sheet: sheet };
  } catch (error) {
    logError(MODULE_SCHEMA, 'buildHolidaySheet', error, '');
    throw error;
  }
}

/**
 * 変更ログシートを作る。見出しは最初から 10 列（CHANGELOG_SHEET.HEADS）。
 * VBA 版は見出し 6 列で作り、GetLogSheet が 7〜10 列を後付けしていた（§3.4）。
 * @return {{name:string, created:boolean}}
 */
function buildChangeLogSheet() {
  try {
    const got = getOrAddSheet_(CONFIG.SHEET_LOG);
    const sheet = got.sheet;
    const heads = CHANGELOG_SHEET.HEADS;

    setIfBlank_(sheet.getRange(CHANGELOG_SHEET.HDR_ROW, 1, 1, heads.length), [heads]);
    styleHeaderRange_(sheet.getRange(CHANGELOG_SHEET.HDR_ROW, 1, 1, heads.length));

    if (got.created) {
      // 変更前/変更後は文字列で持つ。"公休" などが日付に化けるのを防ぐ
      const rows = sheet.getMaxRows() - CHANGELOG_SHEET.FIRST_ROW + 1;
      sheet.getRange(CHANGELOG_SHEET.FIRST_ROW, CHANGELOG_SHEET.COL_BEFORE, rows, 2)
        .setNumberFormat('@');
      sheet.setFrozenRows(CHANGELOG_SHEET.HDR_ROW);
    }

    logSuccess(MODULE_SCHEMA, 'buildChangeLogSheet',
      `sheet=${CONFIG.SHEET_LOG}; created=${got.created}`);
    return { name: CONFIG.SHEET_LOG, created: got.created };
  } catch (error) {
    logError(MODULE_SCHEMA, 'buildChangeLogSheet', error, '');
    throw error;
  }
}

/**
 * シートを取得、無ければ追加。移植元: SC_GetOrAdd
 * @return {{sheet:GoogleAppsScript.Spreadsheet.Sheet, created:boolean}}
 */
function getOrAddSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  const existing = ss.getSheetByName(name);
  if (existing) return { sheet: existing, created: false };
  return { sheet: ss.insertSheet(name), created: true };
}

/**
 * 空欄のセルにだけ書く。既存の値を消さないための唯一の入口。移植元: SC_SetIfBlank
 *
 * 範囲まるごと1回読んで1回書く（§8.3-3）。1セルでも埋まっていれば、
 * そのセルは元の値のまま残す。
 *
 * @param {GoogleAppsScript.Spreadsheet.Range} range 書き込む範囲
 * @param {Array<Array<*>>} values 範囲と同じ形の値
 */
function setIfBlank_(range, values) {
  const current = range.getValues();
  let changed = false;

  const out = current.map(function (row, i) {
    return row.map(function (v, j) {
      const blank = String(v == null ? '' : v).trim() === '';
      const wanted = (values[i] && values[i][j] !== undefined) ? values[i][j] : v;
      if (blank && String(wanted).trim() !== '') {
        changed = true;
        return wanted;
      }
      return v;
    });
  });

  if (changed) range.setValues(out);
}

/** 見出しの体裁を整える。移植元: SC_StyleHeader */
function styleHeaderRange_(range) {
  range.setFontWeight('bold').setBackground(SHEET_BUILD.COLOR_HEADER_BG);
}

/**
 * 列に選択リスト（データの検証）を付ける。移植元: SC_AddList
 *
 * 入力を止めるのではなく警告にする。実物のシートには「薬剤師（時短）」のような
 * 想定外の書き方が入っていることがあり、拒否すると既存データを壊すため。
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet 対象シート
 * @param {number} colNo 列番号
 * @param {string[]} choices 選択肢
 */
function addColumnValidation_(sheet, colNo, choices) {
  const rows = sheet.getMaxRows() - CFG_MEMBER.FIRST_ROW + 1;
  if (rows <= 0) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(choices, true)
    .setAllowInvalid(true)
    .setHelpText(`候補: ${choices.join(' / ')}`)
    .build();
  sheet.getRange(CFG_MEMBER.FIRST_ROW, colNo, rows, 1).setDataValidation(rule);
}
