/**
 * Layout.gs — シート上の位置解決
 *
 * 移植元: ShiftCommon v3.2 の関数部  仕様書: §3.2
 *
 * 【最重要の約束】
 *   1回の実行で1度だけ解決し、返ったオブジェクトを持ち回ること。
 *   VBA 版のように毎回呼び直すと API 呼び出しが跳ね上がり 6 分制限に当たる（§8.3）。
 *
 * 【パレット関連は移植しない】
 *   IsDoctorStamp / PaletteLabel / LastDoctorIndex / PaletteRange /
 *   PaletteBodyRow は、サイドバー化（§6）に伴い丸ごと不要。
 */

const MODULE_LAYOUT = 'Layout';

/**
 * シフトシートの位置をまとめて解決する。
 *
 * 実装の要点（§3.2）:
 *   - 「数式かつ日付」の判定は B 列 1〜LAYOUT.MAX_SCAN_ROWS 行を
 *     getFormulas() と getValues() で1回ずつ読んで突き合わせる
 *     （hasFormula に相当する単発 API は無い）。
 *     formula !== '' かつ value instanceof Date。
 *   - A 列ラベルの前方一致検索も A 列を1回読んで JS 側で走査する。
 *   - 名前付き範囲を優先し、無ければ計算で解決するフォールバックを残す。
 *
 * @param {Sheet} sheet シフトシート
 * @return {{dateRow:number, repeatDateRow:number, headerRow:number, weekRow:number,
 *           doctorTop:number, doctorBottom:number, noteRow:number, docRow:number,
 *           shortageRow:number, gridTop:number, gridBottom:number,
 *           firstCol:number, lastCol:number}}
 */
function resolveLayout(sheet) {
  return notImplemented_(MODULE_LAYOUT, 'resolveLayout', 1); // TODO(P1)
}

/** シフトシートを取得（無ければアクティブシート）。移植元: ShiftSheet */
function getShiftSheet() {
  return notImplemented_(MODULE_LAYOUT, 'getShiftSheet', 1); // TODO(P1)
}

/** 名前でシートを取得。無ければ null。移植元: SheetOrNothing / SheetExists */
function getSheetOrNull(name) {
  return notImplemented_(MODULE_LAYOUT, 'getSheetOrNull', 1); // TODO(P1)
}

/** 名前付き範囲を取得。無ければ null。移植元: NamedRangeOrNothing */
function getNamedRangeOrNull(name) {
  return notImplemented_(MODULE_LAYOUT, 'getNamedRangeOrNull', 1); // TODO(P1)
}

/**
 * B 列で n 個目の「数式かつ日付」の行を返す。
 * 移植元: DateFormulaRow（nth=1 が日付行 / nth=2 が再掲日付行）
 */
function findDateFormulaRow_(sheet, nth) {
  return notImplemented_(MODULE_LAYOUT, 'findDateFormulaRow_', 1); // TODO(P1)
}

/** A 列ラベルの前方一致で行を探す。見つからなければ 0。移植元: LabelRow */
function findLabelRow_(sheet, label) {
  return notImplemented_(MODULE_LAYOUT, 'findLabelRow_', 1); // TODO(P1)
}

/** 列番号を列文字へ（1 → A）。移植元: ColLetter */
function toColumnLetter(colNo) {
  return notImplemented_(MODULE_LAYOUT, 'toColumnLetter', 1); // TODO(P1)
}

/**
 * 入力欄の下端が名前付き範囲と計算解決でどれだけずれているかを返す。
 * 設定チェックが使う。移植元: ShiftRangeDrift
 * @return {number} ずれの行数（0 なら一致）
 */
function getShiftRangeDrift(sheet, layout) {
  return notImplemented_(MODULE_LAYOUT, 'getShiftRangeDrift', 1); // TODO(P1)
}

/** 年月セル（A{headerRow}）を返す。移植元: MonthCell */
function getMonthCell(sheet, layout) {
  return notImplemented_(MODULE_LAYOUT, 'getMonthCell', 1); // TODO(P1)
}

/** 対象月を Date で返す。移植元: MonthValue */
function getMonthValue(sheet, layout) {
  return notImplemented_(MODULE_LAYOUT, 'getMonthValue', 1); // TODO(P1)
}

/** 早番記号か（○ と ◯ の揺れを吸収）。移植元: IsEarlySym */
function isEarlySym(value) {
  return notImplemented_(MODULE_LAYOUT, 'isEarlySym', 1); // TODO(P1)
}

/** 氏名でない行のラベルか（前方一致）。移植元: IsNonName */
function isNonName(value) {
  return notImplemented_(MODULE_LAYOUT, 'isNonName', 1); // TODO(P1)
}
