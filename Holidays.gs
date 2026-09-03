/**
 * Holidays.gs — 祝日マスタの取込
 *
 * 移植元: ShiftSchema.bas の ShiftSchema_祝日マスタ取込 / SC_祝日M式（Power Query）
 * 仕様書: §7.2
 *
 * Power Query → UrlFetchApp。VBA 版の「Excel 2016 以降が要る」制限は消える。
 * script.external_request スコープが要る。
 */

const MODULE_HOLIDAYS = 'Holidays';

/**
 * メニュー「祝日マスタを取り込む」。
 *
 *   const res = UrlFetchApp.fetch(CONFIG.HOLIDAY_CSV_URL);
 *   // 内閣府の CSV は Shift-JIS
 *   const text = res.getBlob().getDataAsString('Shift_JIS');
 *   const rows = Utilities.parseCsv(text);  // 1行目は見出し / 日付は "2026/1/1"
 *
 * 書き込みは既存データを全消去してから setValues() で1回だけ（§8.3-3）。
 * 移植元: ShiftSchema_祝日マスタ取込
 */
function importHolidays() {
  return notImplemented_(MODULE_HOLIDAYS, 'importHolidays', 7); // TODO(P7)
}

/**
 * CSV のテキストを [[Date, 名称], ...] に整える。
 * ネットワークに触らない純粋関数にしておくとテストできる。
 * @param {string} csvText Shift_JIS からデコード済みのテキスト
 * @return {Array<Array<*>>}
 */
function parseHolidayCsv_(csvText) {
  return notImplemented_(MODULE_HOLIDAYS, 'parseHolidayCsv_', 7); // TODO(P7)
}

/**
 * 祝日マスタを「日付キー → 名称」の辞書として読む。
 * 自動作成の工程2（日情報）と Web アプリの表示が使う。シートは1回だけ読む。
 * 祝日マスタが無い／空でも例外にせず空の辞書を返す（祝日なしとして続行できる）。
 * @return {Object<string,string>}
 */
function loadHolidayMap() {
  try {
    const sheet = getSheetOrNull(CONFIG.SHEET_HOLIDAY);
    if (!sheet) return {};
    const last = sheet.getLastRow();
    if (last < HOLIDAY_SHEET.FIRST_ROW) return {};

    const rows = sheet.getRange(HOLIDAY_SHEET.FIRST_ROW, HOLIDAY_SHEET.COL_DATE,
      last - HOLIDAY_SHEET.FIRST_ROW + 1, 2).getValues();
    const map = {};
    rows.forEach(function (r) {
      if (r[0] instanceof Date) map[toDateKey(r[0])] = String(r[1] || '');
    });
    return map;
  } catch (error) {
    logError(MODULE_HOLIDAYS, 'loadHolidayMap', error, '');
    return {};
  }
}

/**
 * 日付を 'yyyy-MM-dd' のキーにする。祝日の突き合わせに使う。
 * Date をそのまま比較すると時刻の差で外れるので、必ずこのキーで比べること。
 * @param {Date} date
 * @return {string}
 */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
