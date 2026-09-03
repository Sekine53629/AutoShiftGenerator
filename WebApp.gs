/**
 * WebApp.gs — Web アプリのサーバ側 API
 *
 * 仕様書 §6 は「クリック入力はサイドバー」としていたが、
 * **利用者の判断でシフト表ごと Web アプリ化する方針に変更した**（2026-09-03）。
 * 経緯と割り切りは docs/WEBAPP-DESIGN.md にまとめてある。
 *
 * 【サイドバーとの決定的な違い】
 *   Web アプリからは `getActiveRange()` が使えない（選択の概念が無い）。
 *   だから「押した瞬間の選択範囲に作用する」というサイドバーの設計は成立せず、
 *   **グリッドを自前で描いて、押されたセルを自分で覚える**必要がある。
 *   Sidebar.gs / Sidebar.html は当面そのまま残す（スプレッドシートを直接使う人向け）。
 *
 * 【読み書きの約束（§8.3-3）】
 *   読みは表示ブロックを丸ごと1回。書きは編集の外接矩形を1回。
 *   セルごとに API を呼ばない。
 */

const MODULE_WEBAPP = 'WebApp';

/** グリッドに書き込めるセルの種別（サーバ側で必ず検証する） */
const WEBAPP_EDITABLE = Object.freeze({
  GRID: 'grid',      // スタッフの入力欄
  NOTE: 'note',      // 備考行
  DOCTOR: 'doctor',  // 医師名欄
  FREE: 'free',      // 自由行（発注担当など）
});

/**
 * Web アプリの入口。
 * @param {Object} e クエリパラメータ
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('WebApp');
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

/**
 * シフト表として扱えるシートの一覧。
 * 「B 列に日付の数式が2つある」ものだけを候補にする（Layout が解決できる形かどうか）。
 * @return {Array<{name:string, isCanonical:boolean}>}
 */
function apiListSheets() {
  try {
    const list = SpreadsheetApp.getActive().getSheets()
      .filter(function (sheet) {
        const name = sheet.getName();
        if (name === CONFIG.SHEET_CFG || name === CONFIG.SHEET_HOLIDAY
          || name === CONFIG.SHEET_LOG || name === CONFIG.SHEET_RUNLOG
          || name === CONFIG.SHEET_SURVEY) return false;
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
 *
 * シートの読みは **1回だけ**（値・表示文字列・数式を A1 から AN{過不足行} まで）。
 * 祝日マスタと設定は別途1回ずつ。
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
    const width = LAYOUT.COL_KIND_WORK;
    const block = sheet.getRange(1, 1, layout.shortageRow, width);
    const values = block.getValues();
    const display = block.getDisplayValues();
    const formulas = block.getFormulas();

    const at = function (grid, row, col) { return grid[row - 1][col - 1]; };
    const holidays = loadHolidayMap();

    // ---- 日の情報 ----
    const days = [];
    const monthValue = at(values, layout.headerRow, 1);
    const targetMonth = (monthValue instanceof Date) ? monthValue.getMonth() : -1;
    for (let c = layout.firstCol; c <= layout.lastCol; c++) {
      const date = at(values, layout.dateRow, c);
      const isDate = date instanceof Date;
      const key = isDate ? toDateKey(date) : '';
      days.push({
        col: c,
        label: at(display, layout.dateRow, c),
        weekLabel: at(display, layout.weekRow, c),
        weekday: isDate ? date.getDay() + 1 : 0,           // 1=日 .. 7=土
        inMonth: isDate && date.getMonth() === targetMonth,
        isHoliday: Object.prototype.hasOwnProperty.call(holidays, key),
        holidayName: holidays[key] || '',
        docCount: at(values, layout.docRow, c),
        pharmCount: at(values, layout.pharmRow, c),
        shortage: at(values, layout.shortageRow, c),
      });
    }

    // ---- スタッフ行 ----
    const rows = [];
    for (let r = layout.gridTop; r <= layout.gridBottom; r++) {
      const cells = [];
      for (let c = layout.firstCol; c <= layout.lastCol; c++) {
        cells.push({
          v: at(display, r, c),
          f: at(formulas, r, c) !== '',            // 数式セルは書き換えない
          sym: matchWorkSym(at(values, r, c)),     // 出勤記号（正規化済み）
        });
      }
      const agg = [];
      for (let c = LAYOUT.COL_AGG_FIRST; c <= LAYOUT.COL_AGG_LAST; c++) {
        agg.push(at(display, r, c));
      }
      rows.push({
        row: r,
        name: String(at(values, r, 1) || ''),
        kind: String(at(values, r, LAYOUT.COL_KIND_WORK) || ''),
        cells: cells,
        agg: agg,
      });
    }

    // ---- 医師名欄・自由行・備考行 ----
    const readRow = function (r) {
      const out = [];
      for (let c = layout.firstCol; c <= layout.lastCol; c++) out.push(at(display, r, c));
      return out;
    };
    const doctors = [];
    for (let r = layout.doctorTop; r <= layout.doctorBottom; r++) {
      doctors.push({ row: r, cells: readRow(r) });
    }
    const freeRow = layout.doctorBottom + 1;

    const result = {
      sheetName: sheetName,
      monthLabel: at(display, layout.headerRow, 1),
      titleLabel: at(display, layout.headerRow, 4),
      summary: at(display, layout.headerRow, 9),
      layout: layout,
      aggHeads: SHEET_BUILD.AGG_HEADS,
      days: days,
      rows: rows,
      doctors: doctors,
      freeRow: { row: freeRow, cells: readRow(freeRow) },
      note: { row: layout.noteRow, cells: readRow(layout.noteRow) },
      aggRowLabels: {
        doc: at(display, layout.docRow, 1),
        pharm: at(display, layout.pharmRow, 1),
        shortage: at(display, layout.shortageRow, 1),
      },
      palette: buildPaletteChoices_(),
    };

    logSuccess(MODULE_WEBAPP, 'apiLoadGrid',
      `sheet=${sheetName}; rows=${rows.length}; days=${days.length}; `
      + `elapsedMs=${Date.now() - started}`);
    return result;
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiLoadGrid', error, `sheetName=${sheetName}`);
    throw error;
  }
}

/**
 * 画面に並べるスタンプの候補。実名は含めない（医師名は別途 N 列から取る）。
 */
function buildPaletteChoices_() {
  const cfgPairs = readSettingPairs();
  return {
    work: [SYM.EARLY, SYM.MID, SYM.LATE],
    off: SYM.OFF_ALL.slice(),
    clerkSym: readSettingText_(cfgPairs, 'gSym'),
    doctorNames: readDoctorNameList_(),
  };
}

/**
 * 医師名の候補（§6.4）。自動作成設定 N 列を正とする。実名はコードに書かない。
 * @return {string[]}
 */
function readDoctorNameList_() {
  try {
    const cfg = getSheetOrNull(CONFIG.SHEET_CFG);
    if (!cfg) return [];
    const top = CFG_SETTING.ROW + 1;
    const rows = Math.max(0, cfg.getLastRow() - top + 1);
    if (rows <= 0) return [];
    const seen = {};
    return cfg.getRange(top, CFG_SETTING.COL_DOCTOR, rows, 1).getValues()
      .map(function (r) { return String(r[0] || '').trim(); })
      .filter(function (name) {
        if (name === '' || seen[name]) return false;
        seen[name] = true;
        return true;
      });
  } catch (error) {
    logError(MODULE_WEBAPP, 'readDoctorNameList_', error, '');
    return [];
  }
}

/**
 * 編集をシートへ書き戻す。
 *
 * 【書き込みの手順】
 *   1. 編集の外接矩形を求める（散らばっていても API 呼び出しは1往復に収める）
 *   2. その矩形の値と数式を読む
 *   3. 数式のあるセルは数式のまま残し、編集対象のセルだけ差し替える
 *   4. 矩形をまるごと1回で書く
 *
 * 数式セルへの書き込みは**黙って無視せず、拒否した旨を返す**（§6.5 の約束）。
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

    const rejected = [];
    const accepted = edits.filter(function (edit) {
      const reason = editRejectReason_(edit, layout);
      if (reason) {
        rejected.push({ row: edit.row, col: edit.col, reason: reason });
        return false;
      }
      return true;
    });
    if (accepted.length === 0) {
      return { written: 0, rejected: rejected };
    }

    const top = Math.min.apply(null, accepted.map(function (e) { return e.row; }));
    const bottom = Math.max.apply(null, accepted.map(function (e) { return e.row; }));
    const left = Math.min.apply(null, accepted.map(function (e) { return e.col; }));
    const right = Math.max.apply(null, accepted.map(function (e) { return e.col; }));

    const range = sheet.getRange(top, left, bottom - top + 1, right - left + 1);
    const values = range.getValues();
    const formulas = range.getFormulas();

    // 数式のあるセルは数式のまま残す（setValues に "=..." を渡すと数式として入る）
    const out = values.map(function (row, i) {
      return row.map(function (v, j) { return formulas[i][j] !== '' ? formulas[i][j] : v; });
    });

    let written = 0;
    accepted.forEach(function (edit) {
      const i = edit.row - top;
      const j = edit.col - left;
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
      + `box=${top},${left}-${bottom},${right}; elapsedMs=${Date.now() - started}`);
    return { written: written, rejected: rejected };
  } catch (error) {
    logError(MODULE_WEBAPP, 'apiSaveCells', error,
      `sheetName=${sheetName}; edits=${edits && edits.length}`);
    throw error;
  }
}

/**
 * 編集を受け付けない理由を返す。受け付けるなら ''。
 * **サーバ側で必ず検証する。**画面側の制限だけに頼ると、集計行や月外の列に
 * 書き込まれて表が壊れる。
 */
function editRejectReason_(edit, layout) {
  const row = Number(edit.row);
  const col = Number(edit.col);
  if (!(col >= layout.firstCol && col <= layout.lastCol)) return '日付の列の外です';

  const inGrid = row >= layout.gridTop && row <= layout.gridBottom;
  const inDoctor = row >= layout.doctorTop && row <= layout.doctorBottom;
  const isNote = row === layout.noteRow;
  const isFree = row === layout.doctorBottom + 1;
  if (!(inGrid || inDoctor || isNote || isFree)) return '書き込めない行です';
  return '';
}

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
