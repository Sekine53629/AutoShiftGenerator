/**
 * Survey.gs — シート構造の調査（読み取り専用）
 *
 * 移植元: ShiftSurvey.bas  仕様書: §7.4
 *
 * 優先度は最後でよい。位置解決が疑わしいときの切り分けに使う。
 *
 * 【必ず守る】氏名のマスク（Config.MASK_NAMES）は個人情報保護のため
 * 常に有効にしておくこと。調査結果を人に見せる場面で使う機能なので、
 * ここを外すと氏名がそのまま出る。
 *
 * 【移植しない】SV_WritePalette / SV_PaletteRole … パレット廃止に伴い不要。
 */

const MODULE_SURVEY = 'Survey';

/**
 * メニュー「シート構造を表示」。
 * 調査結果は CONFIG.SHEET_SURVEY シートへ書く（既存があれば作り直す）。
 * 移植元: ShiftSurvey_シート構造調査
 */
function runSheetSurvey() {
  return notImplemented_(MODULE_SURVEY, 'runSheetSurvey', 8); // TODO(P8)
}

/** 調査結果シートを用意する。移植元: SV_PrepareReport */
function prepareSurveySheet_() {
  return notImplemented_(MODULE_SURVEY, 'prepareSurveySheet_', 8); // TODO(P8)
}

/** ブック情報（シート一覧・行数・列数）。移植元: SV_WriteBookInfo */
function surveyBookInfo_(rows) {
  return notImplemented_(MODULE_SURVEY, 'surveyBookInfo_', 8); // TODO(P8)
}

/** 名前付き範囲の一覧。移植元: SV_WriteNames */
function surveyNamedRanges_(rows) {
  return notImplemented_(MODULE_SURVEY, 'surveyNamedRanges_', 8); // TODO(P8)
}

/** Layout の解決結果を並べる。移植元: SV_WriteDetected */
function surveyDetectedLayout_(rows, sheet) {
  return notImplemented_(MODULE_SURVEY, 'surveyDetectedLayout_', 8); // TODO(P8)
}

/**
 * 行のダンプ（値 / 数式 / 空 の別）。氏名は MASK_NAMES に従って伏せる。
 * 移植元: SV_WriteRowDump / SV_CellKind
 */
function surveyRowDump_(rows, sheet, rowNo) {
  return notImplemented_(MODULE_SURVEY, 'surveyRowDump_', 8); // TODO(P8)
}

/** 列幅の一覧。移植元: SV_WriteColWidths */
function surveyColumnWidths_(rows, sheet) {
  return notImplemented_(MODULE_SURVEY, 'surveyColumnWidths_', 8); // TODO(P8)
}

/** 自動作成設定シートの状態。移植元: SV_WriteConfigSheet / SV_CountMembers */
function surveyConfigSheet_(rows) {
  return notImplemented_(MODULE_SURVEY, 'surveyConfigSheet_', 8); // TODO(P8)
}

/** 氏名を伏せる（MASK_NAMES が true のとき）。 */
function maskName_(name) {
  return notImplemented_(MODULE_SURVEY, 'maskName_', 8); // TODO(P8)
}
