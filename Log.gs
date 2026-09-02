/**
 * Log.gs — エラー/成功ログ
 *
 * 移植元: ErrorLogger v(VBA)  仕様書: §7.1
 *
 * VBA 版は C:\VBAErrorLogs\ErrorLog_YYYYMMDD.csv に CSV を吐いていた。
 * GAS 版は console + 実行ログシート + 致命的なものだけメール通知の3段構え。
 *
 * 【規約】
 *   - Logger.log() は使わない（Tier 2 の禁止事項）
 *   - 全関数の正常終了時に logSuccess() を呼ぶ。VBA 版から続く
 *     「テストの合否をログで判定する」運用を維持するため
 *   - 自動作成の実行時間は logSuccess の details に elapsedMs を必ず載せる（§8.3-5）
 */

const MODULE_LOG = 'Log';

/**
 * 実装が終わっていない関数の目印。
 * 骨組みの段階でシートを壊さないよう、黙って何もせず終わらせずに必ず投げる。
 * @param {string} moduleName モジュール名
 * @param {string} funcName 関数名
 * @param {string} phase 実装フェーズ（仕様書 §9）
 */
function notImplemented_(moduleName, funcName, phase) {
  throw new Error(`未実装: ${moduleName}.${funcName}（実装フェーズ ${phase} / docs/GAS-PORTING-SPEC.md §9）`);
}

/**
 * エラーを記録する。console.error → 実行ログシート → 致命的ならメール。
 * @param {string} moduleName モジュール名
 * @param {string} funcName 関数名
 * @param {Error} error 捕捉した例外
 * @param {string} context 呼び出し時の状況（引数の値など）
 * @param {boolean=} notify 管理者へメール通知するか
 */
function logError(moduleName, funcName, error, context, notify) {
  return notImplemented_(MODULE_LOG, 'logError', 1); // TODO(P1)
}

/**
 * 正常終了を記録する。
 * @param {string} moduleName モジュール名
 * @param {string} funcName 関数名
 * @param {string} details 処理件数・所要時間など
 */
function logSuccess(moduleName, funcName, details) {
  return notImplemented_(MODULE_LOG, 'logSuccess', 1); // TODO(P1)
}

/**
 * 実行ログシートへ1行追記する。上限行数を超えたら古い行から削る。
 * @param {string} level 'OK' | 'ERROR'
 * @param {string} moduleName モジュール名
 * @param {string} funcName 関数名
 * @param {string} message 本文
 * @param {string} context 補足
 */
function appendRunLogRow_(level, moduleName, funcName, message, context) {
  return notImplemented_(MODULE_LOG, 'appendRunLogRow_', 1); // TODO(P1)
}

/** 実行ログシートを取得（無ければ作る）。 @return {Sheet} */
function getRunLogSheet_() {
  return notImplemented_(MODULE_LOG, 'getRunLogSheet_', 1); // TODO(P1)
}

/** 保持行数を超えた古い行を削る。 */
function trimRunLog_(sheet) {
  return notImplemented_(MODULE_LOG, 'trimRunLog_', 1); // TODO(P1)
}

/**
 * 管理者の通知先。スクリプトプロパティ優先、無ければ実行ユーザー。
 * コードにメールアドレスを書かないための入口（Tier 1）。
 * @return {string}
 */
function getAdminEmail_() {
  return notImplemented_(MODULE_LOG, 'getAdminEmail_', 1); // TODO(P1)
}
