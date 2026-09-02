/**
 * Menu.gs — onOpen とメニュー
 *
 * 移植元: パレットの動作ボタン（ShiftClick の IDX_AUTO / IDX_UNDO / IDX_EXPORT）と
 *         VBA のマクロ一覧  仕様書: §6
 *
 * メニューの表示名だけは日本語。関数名は camelCase の英語にする（Tier 2）。
 */

const MODULE_MENU = 'Menu';

/** スプレッドシートを開いたときに走る簡易トリガ。 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('シフト')
      .addItem('入力パレットを開く', 'showSidebar')
      .addSeparator()
      .addItem('シフト自動作成', 'runAutoShift')
      .addItem('設定チェック', 'runSettingsCheck')
      .addItem('事前診断', 'runPreflightDiagnosis')
      .addSeparator()
      .addItem('変更を戻す', 'undoLastSession')
      .addItem('シフト白紙化', 'clearShiftGrid')
      .addItem('変更ログをリセット', 'resetChangeLog')
      .addSeparator()
      .addSubMenu(SpreadsheetApp.getUi().createMenu('初期設定')
        .addItem('不足シートを生成', 'buildMissingSheets')
        .addItem('数式・名前付き範囲を作り直す', 'runInitialSetup')
        .addItem('祝日マスタを取り込む', 'importHolidays'))
      .addSeparator()
      .addItem('PDF 出力', 'exportShiftPdf')
      .addItem('シート構造を表示', 'runSheetSurvey')
      .addToUi();
  } catch (error) {
    console.error(`[${MODULE_MENU}.onOpen] ${error.message}\nstack: ${error.stack}`);
  }
}

/** サイドバー（入力パレット）を開く。 */
function showSidebar() {
  return notImplemented_(MODULE_MENU, 'showSidebar', 6); // TODO(P6)
}

/**
 * 長文レポートを表示する。
 * getUi().alert() は長文に向かないので HtmlService のモーダルを使う（§4.5）。
 * @param {string} title 見出し
 * @param {string} body 本文（プレーンテキスト）
 */
function showReportDialog(title, body) {
  return notImplemented_(MODULE_MENU, 'showReportDialog', 4); // TODO(P4)
}
