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
 * 祝日マスタを Set<日付シリアル> として読む。
 * 自動作成の工程2（日情報）が使う。シートは1回だけ読む。
 * @return {Object} 日付キー → 名称
 */
function loadHolidayMap() {
  return notImplemented_(MODULE_HOLIDAYS, 'loadHolidayMap', 7); // TODO(P7)
}
