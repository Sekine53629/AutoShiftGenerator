/**
 * Report.gs — 結果レポートの文字列組み立て
 *
 * 移植元: ShiftAutoPlace.bas の AP_レポート*  仕様書: §4.5
 *
 * 見出し → 個人別 → 警告 の3部構成。ここも SpreadsheetApp を呼ばず、
 * Engine の出力と ShiftAuto が読んだ ctx だけから文字列を組む。
 *
 * 表示は Menu.showReportDialog()（HtmlService のモーダル）。
 * getUi().alert() は長文に向かないので使わない。
 */

const MODULE_REPORT = 'Report';

/**
 * レポート全体を組み立てる。
 * @return {string} プレーンテキストのレポート
 * 移植元: AS_レポート
 */
function buildReport(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'buildReport', 4); // TODO(P4)
}

/**
 * 見出し — 対象月 / 公休ノルマ / 書込セル数 / 入力範囲 / 対象者数。
 * 移植元: AP_レポート見出し
 */
function buildReportHeader_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'buildReportHeader_', 4); // TODO(P4)
}

/**
 * 個人別 — 出勤n 休n(うちノルマ外n) 連勤maxn 連休maxn 医5日n ○n ●n ▲n。
 * 既存入力の集計は existing[][] から数える（シートを読み直さない。§8.3-1）。
 * 移植元: AP_レポート個人別
 */
function buildReportPerMember_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'buildReportPerMember_', 4); // TODO(P4)
}

/**
 * 警告 — 以下は必ず出す（§4.5）。
 *   公休ノルマ未達 / 事務員が不在の日 / 遅番が目標に届かない日 /
 *   勤務ルールの検証 / 連勤上乗せの影響 / 必要数に届かない日 + 人日収支 /
 *   設定未登録 / マスタにあるがシフト表に無い
 * 移植元: AP_レポート警告
 */
function buildReportWarnings_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'buildReportWarnings_', 4); // TODO(P4)
}

/**
 * 勤務ルールの検証 — 週N日/固定曜日が守られているかを
 * マクロ自身の週の切り方（日曜起点）で数え直す。
 * 移植元: AP_勤務ルールの検証
 */
function verifyWorkRules_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'verifyWorkRules_', 4); // TODO(P4)
}

/** 週N日の検証。移植元: AP_週N日の検証 */
function verifyWeekNRule_(ctx, engineOutput, i) {
  return notImplemented_(MODULE_REPORT, 'verifyWeekNRule_', 4); // TODO(P4)
}

/** 固定曜日の検証。移植元: AP_固定曜日の検証 */
function verifyFixedDowRule_(ctx, engineOutput, i) {
  return notImplemented_(MODULE_REPORT, 'verifyFixedDowRule_', 4); // TODO(P4)
}

/**
 * 連勤上乗せの影響 — 上乗せ（runBonus）を使った結果、通常上限を超えた人を
 * 必ず名指しで列挙する。労務上の例外なので伏せない。
 * 移植元: AP_連勤上乗せの影響
 */
function reportRunBonusImpact_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'reportRunBonusImpact_', 4); // TODO(P4)
}

/**
 * 人日収支 — 月の必要人日 vs 出勤人日。
 * 「配分の偏り」か「人手不足」かを利用者に判別させるために出す。
 * 移植元: AP_人日収支
 */
function reportManDayBalance_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'reportManDayBalance_', 4); // TODO(P4)
}

/** 事務員が不在の日数。移植元: AP_事務員不在日数 */
function countClerkAbsentDays_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'countClerkAbsentDays_', 4); // TODO(P4)
}

/** ある日の遅番の人数。existing[][] と symbol[][] から数える。移植元: AP_日別遅番数 */
function countLateOnDay_(ctx, engineOutput, j) {
  return notImplemented_(MODULE_REPORT, 'countLateOnDay_', 4); // TODO(P4)
}

/**
 * 遅番が目標に届かない日数。「目標-1名未満」の日も併せて返す。
 * 移植元: AP_遅番不足日数
 */
function countLateShortDays_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'countLateShortDays_', 4); // TODO(P4)
}

/** 必要数に届かない日数と、最も不足した日。移植元: AP_必要数不足日数 */
function countCoverShortDays_(ctx, engineOutput) {
  return notImplemented_(MODULE_REPORT, 'countCoverShortDays_', 4); // TODO(P4)
}
