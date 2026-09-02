/**
 * Export.gs — 印刷用の出力（PDF）
 *
 * 移植元: ShiftExport.bas  仕様書: §7.3
 *
 * VBA 版は「値と書式を固めた別ブックを作って印刷設定を当てる」手順だったが、
 * Sheets はエクスポート URL に範囲と印刷設定を渡せるので、その手順ごと不要。
 * XP_BuildBook / XP_BakeFormats / XP_SetPageSetup は移植しない。
 *
 * 出力範囲は VBA 版と同じ 年月・タイトル行 〜 過不足行 / A 〜 AM。
 * Excel(.xlsx) 出力は優先度低。必要なら同じ URL の format=xlsx で足りる。
 */

const MODULE_EXPORT = 'Export';

/** PDF の余白。VBA 版 MARGIN_CM = 0.6 をインチへ直した値 */
const EXPORT_MARGIN_INCH = 0.24;

/**
 * メニュー「PDF 出力」。
 *
 *   const url = `https://docs.google.com/spreadsheets/d/${ss.getId()}/export?` +
 *     `format=pdf&gid=${sheet.getSheetId()}` +
 *     `&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false` +
 *     `&top_margin=...&bottom_margin=...&left_margin=...&right_margin=...` +
 *     `&r1=${top-1}&r2=${bottom}&c1=0&c2=${lastCol}`;
 *   const blob = UrlFetchApp.fetch(url, {
 *     headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
 *   }).getBlob().setName(fileName + '.pdf');
 *
 * 保存先は CONFIG.PROP_EXPORT_FOLDER_ID（スクリプトプロパティ）。
 * ロジックにフォルダ ID をハードコードしない（Tier 1 / Tier 2）。
 * 移植元: ShiftExport_シフト表出力
 */
function exportShiftPdf() {
  return notImplemented_(MODULE_EXPORT, 'exportShiftPdf', 7); // TODO(P7)
}

/**
 * 出力範囲（年月・タイトル行 〜 過不足行 / A 〜 AM）を返す。
 * 移植元: XP_SourceRange
 */
function getExportRange_(sheet, layout) {
  return notImplemented_(MODULE_EXPORT, 'getExportRange_', 7); // TODO(P7)
}

/**
 * 既定のファイル名。VBA 版の命名に合わせる。
 * 移植元: XP_DefaultName
 */
function buildExportFileName_(sheet, layout) {
  return notImplemented_(MODULE_EXPORT, 'buildExportFileName_', 7); // TODO(P7)
}

/**
 * 保存先フォルダ。スクリプトプロパティに無ければマイドライブ直下。
 * @return {Folder}
 */
function getExportFolder_() {
  return notImplemented_(MODULE_EXPORT, 'getExportFolder_', 7); // TODO(P7)
}
