/**
 * WebApp.gs — Web アプリのサーバ側 API
 *
 * 画面は WebAppView.html。
 * ※ Apps Script はファイル名が拡張子をまたいで一意でなければならないので、
 *   `WebApp.gs` と `WebApp.html` は同居できない。だから画面側は別名にしてある。
 *
 * 仕様書 §6 は「クリック入力はサイドバー」としていたが、
 * **利用者の判断でシフト表ごと Web アプリ化する方針に変更した**（2026-09-03）。
 * 経緯と割り切りは docs/WEBAPP-DESIGN.md にまとめてある。
 * 旧サイドバーの骨組みは archive/ に置いた。
 *
 * 【サイドバーとの決定的な違い】
 *   Web アプリからは `getActiveRange()` が使えない（選択の概念が無い）。
 *   だから「押した瞬間の選択範囲に作用する」というサイドバーの設計は成立せず、
 *   **グリッドを自前で描いて、押されたセルを自分で覚える**必要がある。
 *
 * 【読み書きの約束（§8.3-3）】
 *   読みは表示ブロックを丸ごと1回。書きは編集の外接矩形を1回。
 *   セルごとに API を呼ばない。
 */

const MODULE_WEBAPP = 'WebApp';

/**
 * Web アプリの入口。
 * @param {Object} e クエリパラメータ
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('WebAppView');
    // 生の文字列を <?= ?> で埋めると、シート名に含まれる文字で JS が壊れる。
    // 必ず JSON にしてから <?!= ?> で出すこと
    template.initialSheetJson = JSON.stringify(
      (e && e.parameter && e.parameter.sheet) || '');
    return template.evaluate()
      .setTitle('シフト表')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (error) {
    logError(MODULE_WEBAPP, 'doGet', error, '', true);
    return HtmlService.createHtmlOutput(
      `<p>画面を開けませんでした。</p><pre>${error.message}</pre>`);
  }
}

/* ================================================================
 *  読み出し
 * ================================================================ */

/**
 * シフト表として扱えるシートの一覧。
 * Layout が解決できるシートだけを候補に出す（日付の数式が2つあるか）。
 * @return {Array<{name:string, isCanonical:boolean}>}
 */
function apiListSheets() {
  try {
    const skip = [CONFIG.SHEET_CFG, CONFIG.SHEET_HOLIDAY, CONFIG.SHEET_LOG,
                  CONFIG.SHEET_RUNLOG, CONFIG.SHEET_SURVEY];
    const list = SpreadsheetApp.getActive().getSheets()
      .filter(function (sheet) {
        if (skip.indexOf(sheet.getName()) >= 0) return false;
        try {
          resolveLayout(sheet);
          return true;
        } catch (ignored) {
          return false;   // 解決できないシートは候補に出さない
        }
      })
      .map(function (sheet) {
        return { name: sheet.getName(), isCanonical: sheet.getName() === CONFIG.SHEET_SHIFT };
      });
    logSuccess(MODULE_WEBAPP, 'apiListSheets', `count=${list.length}`);
    return list;
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiListSheets', error, '');
    throw error;
  }
}

/**
 * 1シート分の表示データを組み立てる。
 * シートの読みは **1回だけ**（A1 から AN{過不足行} まで、値・表示・数式）。
 *
 * @param {string} sheetName シート名
 * @return {Object} 画面が描くのに必要な一式
 */
function apiLoadGrid(sheetName) {
  const started = Date.now();
  try {
    const sheet = getSheetOrNull(sheetName);
    if (!sheet) throw new Error(`シート「${sheetName}」がありません。`);

    const layout = resolveLayout(sheet);
    const block = sheet.getRange(1, 1, layout.shortageRow, LAYOUT.COL_KIND_WORK);
    const view = {
      layout: layout,
      values: block.getValues(),
      display: block.getDisplayValues(),
      formulas: block.getFormulas(),
      at: function (grid, row, col) { return this[grid][row - 1][col - 1]; },
    };

    const result = {
      sheetName: sheetName,
      monthLabel: view.at('display', layout.headerRow, 1),
      titleLabel: view.at('display', layout.headerRow, 4),
      summary: view.at('display', layout.headerRow, 9),
      layout: layout,
      aggHeads: SHEET_BUILD.AGG_HEADS,
      days: buildDayCells_(view),
      rows: buildStaffRows_(view),
      sections: buildSectionRows_(view),
      aggRowLabels: {
        doc: view.at('display', layout.docRow, 1),
        pharm: view.at('display', layout.pharmRow, 1),
        shortage: view.at('display', layout.shortageRow, 1),
      },
      palette: buildPalette_(),
      regionRules: STAMP_REGION_RULES,
    };

    logSuccess(MODULE_WEBAPP, 'apiLoadGrid',
      `sheet=${sheetName}; rows=${result.rows.length}; days=${result.days.length}; `
      + `elapsedMs=${Date.now() - started}`);
    return result;
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiLoadGrid', error, `sheetName=${sheetName}`);
    throw error;
  }
}

/** 日付列ごとの情報（曜日・祝日・月内か・集計行の値）。 */
function buildDayCells_(view) {
  const layout = view.layout;
  const holidays = loadHolidayMap();
  const monthValue = view.at('values', layout.headerRow, 1);
  const targetMonth = (monthValue instanceof Date) ? monthValue.getMonth() : -1;

  const days = [];
  for (let c = layout.firstCol; c <= layout.lastCol; c++) {
    const date = view.at('values', layout.dateRow, c);
    const isDate = date instanceof Date;
    const key = isDate ? toDateKey(date) : '';
    days.push({
      col: c,
      label: view.at('display', layout.dateRow, c),
      weekLabel: view.at('display', layout.weekRow, c),
      weekday: isDate ? date.getDay() + 1 : 0,        // 1=日 .. 7=土
      inMonth: isDate && date.getMonth() === targetMonth,
      isHoliday: Object.prototype.hasOwnProperty.call(holidays, key),
      holidayName: holidays[key] || '',
      docCount: view.at('values', layout.docRow, c),
      pharmCount: view.at('values', layout.pharmRow, c),
      shortage: view.at('values', layout.shortageRow, c),
    });
  }
  return days;
}

/** 1行分のセル（表示文字列・数式か・正規化した出勤記号）。 */
function buildRowCells_(view, row) {
  const layout = view.layout;
  const cells = [];
  for (let c = layout.firstCol; c <= layout.lastCol; c++) {
    cells.push({
      v: view.at('display', row, c),
      f: view.at('formulas', row, c) !== '',        // 数式セルは書き換えない
      sym: matchWorkSym(view.at('values', row, c)),
    });
  }
  return cells;
}

/** スタッフの入力欄。集計列（AH〜AM）と区分（AN）も添える。 */
function buildStaffRows_(view) {
  const layout = view.layout;
  const rows = [];
  for (let r = layout.gridTop; r <= layout.gridBottom; r++) {
    const agg = [];
    for (let c = LAYOUT.COL_AGG_FIRST; c <= LAYOUT.COL_AGG_LAST; c++) {
      agg.push(view.at('display', r, c));
    }
    rows.push({
      row: r,
      region: EDIT_REGION.GRID,
      name: String(view.at('values', r, 1) || ''),
      kind: String(view.at('values', r, LAYOUT.COL_KIND_WORK) || ''),
      cells: buildRowCells_(view, r),
      agg: agg,
    });
  }
  return rows;
}

/**
 * 医師名欄・自由行・備考行。
 * 入力欄とは書ける物が違うので region を持たせ、画面がボタンを出し分けられるようにする。
 */
function buildSectionRows_(view) {
  const layout = view.layout;
  const sections = [];

  for (let r = layout.doctorTop; r <= layout.doctorBottom; r++) {
    sections.push({
      row: r,
      region: EDIT_REGION.DOCTOR,
      label: r === layout.doctorTop ? LABEL.DOCTORS : '',
      cells: buildRowCells_(view, r),
      place: 'above',
    });
  }
  sections.push({
    row: layout.doctorBottom + 1,
    region: EDIT_REGION.FREE,
    label: '',
    cells: buildRowCells_(view, layout.doctorBottom + 1),
    place: 'above',
  });
  sections.push({
    row: layout.noteRow,
    region: EDIT_REGION.NOTE,
    label: LABEL.NOTE,
    cells: buildRowCells_(view, layout.noteRow),
    place: 'below',
  });
  return sections;
}

/**
 * 画面に並べるスタンプの候補。
 * シフト記号は Config から、医師名は自動作成設定 N 列から。実名はコードに書かない。
 */
function buildPalette_() {
  const cfgPairs = readSettingPairs();
  const clerkSym = readSettingText_(cfgPairs, 'gSym');
  const base = [SYM.EARLY, SYM.MID, SYM.LATE];
  const symbols = base
    .concat(clerkSym && base.indexOf(clerkSym) < 0 ? [clerkSym] : [])
    .concat(SYM.OFF_ALL);

  return { symbols: symbols, doctorNames: readDoctorNames() };
}

/* ================================================================
 *  書き込み
 * ================================================================ */

/**
 * 編集をシートへ書き戻す。
 *
 * 【書き込みの手順】
 *   1. 受け付けてよい編集だけに絞る（stampRejectReason_）
 *   2. 残った編集の外接矩形を求める（散らばっていても API は1往復）
 *   3. 矩形の値と数式を読み、数式のセルは数式のまま残す
 *   4. 矩形をまるごと1回で書く
 *
 * 拒否したものは**黙って捨てず、理由を付けて画面へ返す**（§6.3 の約束）。
 *
 * @param {string} sheetName シート名
 * @param {Array<{row:number, col:number, value:string}>} edits 編集
 * @return {{written:number, rejected:Array<{row:number, col:number, reason:string}>}}
 */
function apiSaveCells(sheetName, edits) {
  const started = Date.now();
  try {
    if (!edits || edits.length === 0) return { written: 0, rejected: [] };

    const sheet = getSheetOrNull(sheetName);
    if (!sheet) throw new Error(`シート「${sheetName}」がありません。`);
    const layout = resolveLayout(sheet);
    const doctorNames = readDoctorNames();

    const rejected = [];
    const accepted = edits.filter(function (edit) {
      const reason = stampRejectReason_(edit, layout, doctorNames);
      if (reason) {
        rejected.push({ row: edit.row, col: edit.col, reason: reason });
        return false;
      }
      return true;
    });
    if (accepted.length === 0) return { written: 0, rejected: rejected };

    const box = boundingBox_(accepted);
    const range = sheet.getRange(box.top, box.left,
      box.bottom - box.top + 1, box.right - box.left + 1);
    const values = range.getValues();
    const formulas = range.getFormulas();

    // 数式のあるセルは数式のまま残す（setValues に "=..." を渡すと数式として入る）
    const out = values.map(function (row, i) {
      return row.map(function (v, j) { return formulas[i][j] !== '' ? formulas[i][j] : v; });
    });

    let written = 0;
    accepted.forEach(function (edit) {
      const i = edit.row - box.top;
      const j = edit.col - box.left;
      if (formulas[i][j] !== '') {
        rejected.push({ row: edit.row, col: edit.col, reason: '数式のセルなので書き換えません' });
        return;
      }
      out[i][j] = edit.value;
      written++;
    });

    range.setValues(out);
    SpreadsheetApp.flush();

    // TODO(P5): ChangeLog.appendChangeLog() へ旧値を積む。
    //   Web アプリが唯一の入力経路になるので、ここで漏れなく記録できる（§6.6）。

    logSuccess(MODULE_WEBAPP, 'apiSaveCells',
      `sheet=${sheetName}; written=${written}; rejected=${rejected.length}; `
      + `box=${box.top},${box.left}-${box.bottom},${box.right}; `
      + `elapsedMs=${Date.now() - started}`);
    return { written: written, rejected: rejected };
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiSaveCells', error,
      `sheetName=${sheetName}; edits=${edits && edits.length}`);
    throw error;
  }
}

/** 編集の外接矩形。散らばった編集でも読み書きを1往復に収めるために使う。 */
function boundingBox_(edits) {
  const rows = edits.map(function (e) { return Number(e.row); });
  const cols = edits.map(function (e) { return Number(e.col); });
  return {
    top: Math.min.apply(null, rows),
    bottom: Math.max.apply(null, rows),
    left: Math.min.apply(null, cols),
    right: Math.max.apply(null, cols),
  };
}

/** 行がどの領域か。移植元: ClickTargetArea（TGT_* の判定） */
function classifyEditRegion_(row, layout) {
  if (row >= layout.gridTop && row <= layout.gridBottom) return EDIT_REGION.GRID;
  if (row >= layout.doctorTop && row <= layout.doctorBottom) return EDIT_REGION.DOCTOR;
  if (row === layout.noteRow) return EDIT_REGION.NOTE;
  if (row === layout.doctorBottom + 1) return EDIT_REGION.FREE;
  return EDIT_REGION.NONE;
}

/**
 * その編集を受け付けない理由を返す。受け付けるなら ''。
 * SpreadsheetApp を呼ばない純粋関数なのでテストできる。
 *
 * 【サーバ側で必ず検証する】
 *   画面側の制限だけに頼ると、画面のバグや細工したリクエストで
 *   集計行や日付行に書き込まれ、表が黙って壊れる。
 *
 * 【何を守っているか（§6.3 の移植）】
 *   - シフト記号を入力欄の外へ出さない。
 *     医師数(診) は医師名欄を COUNTA で数えているので、記号が1つ紛れ込むだけで
 *     医師数が水増しされ、必要数と過不足がまるごと狂う
 *   - 医師名を入力欄へ入れない。出勤とも休みとも解釈できない文字列が
 *     ST_FOFF（休み）として数えられ、公休ノルマがずれる
 *   - 消去（空文字）はどこでも許す。書き間違いを直せなくなるため
 *
 * @param {{row:number, col:number, value:string}} edit 編集
 * @param {Object} layout resolveLayout の戻り値
 * @param {string[]} doctorNames 医師名の候補
 * @return {string}
 */
function stampRejectReason_(edit, layout, doctorNames) {
  const row = Number(edit.row);
  const col = Number(edit.col);
  if (!(col >= layout.firstCol && col <= layout.lastCol)) return '日付の列の外です';

  const region = classifyEditRegion_(row, layout);
  if (region === EDIT_REGION.NONE) return '書き込めない行です';

  const value = String(edit.value == null ? '' : edit.value).trim();
  if (value === '') return '';                       // 消去はどこでも許す

  const isDoctor = (doctorNames || []).indexOf(value) >= 0;

  if (region === EDIT_REGION.GRID) {
    return isDoctor ? '医師名はシフト入力欄には入れられません' : '';
  }
  if (isShiftSymbol(value)) {
    return 'シフト記号はシフト入力欄にだけ入れられます（医師数や出勤数が狂います）';
  }
  if (region === EDIT_REGION.DOCTOR && !isDoctor) {
    return '医師名欄には自動作成設定 N 列の医師名だけを入れられます';
  }
  return '';
}

/* ================================================================
 *  そのほかの操作
 * ================================================================ */

/**
 * Web アプリからシフト表シートを作る。
 * @return {{sheetName:string}}
 */
function apiCreateSheet(year, month) {
  try {
    const sheet = buildShiftSheet(Number(year), Number(month));
    return { sheetName: sheet.getName() };
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiCreateSheet', error, `year=${year}; month=${month}`);
    throw error;
  }
}

/**
 * 自動作成を Web アプリから走らせる。
 * 配置エンジン（フェーズ3）が未実装なので、いまは理由を返すだけ。
 */
function apiRunAutoShift(sheetName) {
  return notImplemented_(MODULE_WEBAPP, 'apiRunAutoShift', 4); // TODO(P4)
}

/**
 * デプロイ済み Web アプリの URL。メニューから開けるようにするために使う。
 * デプロイ前は空文字を返す。
 * @return {string}
 */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (error) {
    logError(MODULE_WEBAPP, 'getWebAppUrl', error, '');
    return '';
  }
}
