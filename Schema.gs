/**
 * Schema.gs — 不足シートの生成
 *
 * 移植元: ShiftSchema.bas（祝日の取込は Holidays.gs へ分離）
 * 仕様書: §3.3 / §3.4 / §6.4
 *
 * 【生成の約束】
 *   空欄のセルにしか書かない。既存の値は絶対に消さない（SC_SetIfBlank と同じ）。
 */

const MODULE_SCHEMA = 'Schema';

/**
 * メニュー「不足シートを生成」。
 * 自動作成設定 / 祝日マスタ / シフト変更ログ のうち無いものだけ作る。
 * 移植元: ShiftSchema_不足シート生成
 */
function buildMissingSheets() {
  return notImplemented_(MODULE_SCHEMA, 'buildMissingSheets', 2); // TODO(P2)
}

/**
 * 自動作成設定シートを作る。
 *   メンバー表（4行目=見出し / 5行目〜）+ 全体設定（K=ラベル / L=値）+
 *   医師名リスト（N 列。§6.4。VBA 版のパレットに置いていた医師名の置き場）
 * 区分・勤務ルール・可否には入力規則（データの検証）を付ける。
 * 移植元: ShiftSchema_自動作成設定生成
 */
function buildConfigSheet() {
  return notImplemented_(MODULE_SCHEMA, 'buildConfigSheet', 2); // TODO(P2)
}

/**
 * 祝日マスタシートを作る（見出しだけ。データの取込は Holidays.gs）。
 * 移植元: ShiftSchema_祝日マスタ生成
 */
function buildHolidaySheet() {
  return notImplemented_(MODULE_SCHEMA, 'buildHolidaySheet', 2); // TODO(P2)
}

/**
 * 変更ログシートを作る。見出しは最初から 10 列（CHANGELOG_SHEET.HEADS）。
 * 変更前/変更後の列は書式を文字列にしておく（"公休" 等が日付に化けないため）。
 * 移植元: ShiftSchema_変更ログ生成
 */
function buildChangeLogSheet() {
  return notImplemented_(MODULE_SCHEMA, 'buildChangeLogSheet', 2); // TODO(P2)
}

/** シートを取得、無ければ追加。移植元: SC_GetOrAdd */
function getOrAddSheet_(name) {
  return notImplemented_(MODULE_SCHEMA, 'getOrAddSheet_', 2); // TODO(P2)
}

/** 空欄のときだけ書く。既存の値を消さないための唯一の入口。移植元: SC_SetIfBlank */
function setIfBlank_(range, value) {
  return notImplemented_(MODULE_SCHEMA, 'setIfBlank_', 2); // TODO(P2)
}

/** 見出しの体裁を整える。移植元: SC_StyleHeader */
function styleHeaderRange_(range) {
  return notImplemented_(MODULE_SCHEMA, 'styleHeaderRange_', 2); // TODO(P2)
}

/** 列に選択リスト（データの検証）を付ける。移植元: SC_AddList */
function addColumnValidation_(sheet, colNo, choices) {
  return notImplemented_(MODULE_SCHEMA, 'addColumnValidation_', 2); // TODO(P2)
}
