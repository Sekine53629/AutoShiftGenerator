/**
 * Store.gs — 複数の PC から編集するための保存層
 *
 * VBA 版にも仕様書にも無い。`docs/DEPLOY-PLAN.md` 構成B の「保存先だけ Sheets に」を、
 * 実際に組むときの置き場として起こしたもの。
 *
 * 【なぜシートのセルではなく Drive のファイルか】
 *   Apps Script に本物のデータベースは無い。永続する置き場は3つだけで、
 *
 *     PropertiesService  1値 9KB・全体 500KB      設定値どまり。マスタには小さい
 *     CacheService       最大6時間で消える        保存には使えない
 *     Drive のファイル    実質無制限              JSON 1個をそのまま置ける
 *
 *   マスタは入れ子の構造（社員が使える記号の配列、店舗ごとの営業時間…）なので、
 *   セルの表に展開すると項目を足すたびに列対応を書き直すことになる。
 *   JSON のまま置けば、画面が持つ形をそのまま保存できる。
 *
 *   **スプレッドシートは出力先として残る**（Export.gs）。人が読む表はそちら。
 *
 * 【同時編集】
 *   ファイルごとに版番号（rev）を持つ。保存するときは「読んだときの rev」を送り、
 *   サーバ側で今の rev と突き合わせる。**違っていたら書かない。**
 *   誰かの編集を黙って消すより、画面に出して読み直してもらう。
 *
 *   最後に書いた人と時刻も返す。「誰の編集と衝突したのか」が分からないと、
 *   読み直す前に声を掛けることができない。
 *
 * 【書き込みの直列化】
 *   読んで・比べて・書く、の間に他の実行が割り込むと版番号の意味が無くなる。
 *   LockService で囲う。待つのは最大 20 秒。
 */

const MODULE_STORE = 'Store';

/** 保存先フォルダの ID を入れるスクリプトプロパティ */
const STORE_PROP_FOLDER = 'DATA_FOLDER_ID';

/** 保存先フォルダの名前。プロパティが空のときに作る */
const STORE_FOLDER_NAME = 'AutoShiftGenerator データ';

/** マスタを入れるファイル名 */
const STORE_DB_FILE = 'masters.json';

/** 書き込みの順番待ちの上限（ミリ秒） */
const STORE_LOCK_WAIT_MS = 20000;

/** 1ファイルの上限。これを超える保存は受け付けない（事故で肥大したものを弾く） */
const STORE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * 保存先のフォルダ。プロパティに無ければ作って覚える。
 * ロジックにフォルダ ID を書かない（Tier 1「No Hard-Coded Paths」）。
 * @return {GoogleAppsScript.Drive.Folder}
 */
function storeFolder_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty(STORE_PROP_FOLDER);
    if (id) {
      try {
        return DriveApp.getFolderById(id);
      } catch (ignored) {
        // 消された・権限が変わった。作り直して覚え直す
        console.error(`[${MODULE_STORE}.storeFolder_] フォルダを開けません: ${id}`);
      }
    }
    const folder = DriveApp.createFolder(STORE_FOLDER_NAME);
    props.setProperty(STORE_PROP_FOLDER, folder.getId());
    return folder;
  } catch (error) {
    logError(MODULE_STORE, 'storeFolder_', error, '');
    throw error;
  }
}

/**
 * 月ごとのシフトを入れるファイル名。
 * 店舗と年月で1ファイル。**分けることが同時編集の単位になる。**
 * 1ファイルにまとめると、別の店・別の月を触っただけで衝突する。
 */
function storeCellsFile_(storeId, ym) {
  const s = String(storeId || '').trim();
  const m = String(ym || '').trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(s)) {
    throw new Error('[storeCellsFile_] 店舗 ID が不正です: ' + storeId);
  }
  if (!/^\d{4}-\d{2}$/.test(m)) {
    throw new Error('[storeCellsFile_] 年月が不正です: ' + ym);
  }
  return 'cells-' + s + '-' + m + '.json';
}

/** 名前でファイルを探す。無ければ null */
function storeFileOrNull_(name) {
  const it = storeFolder_().getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

/**
 * 読み出す。まだ無ければ rev 0 と null を返す。
 *
 * **「無い」と「読めない」を分ける。** 壊れたファイルを「無い」として
 * 扱うと、次の保存で中身を消してしまう。
 *
 * @return {{rev:number, data:Object|null, updatedAt:string, updatedBy:string}}
 */
function storeRead_(name) {
  try {
    const file = storeFileOrNull_(name);
    if (!file) return { rev: 0, data: null, updatedAt: '', updatedBy: '' };

    const text = file.getBlob().getDataAsString('UTF-8');
    let box;
    try {
      box = JSON.parse(text);
    } catch (e) {
      throw new Error('保存されている内容が JSON として読めません: ' + name);
    }
    return {
      rev: Number(box && box.rev) || 0,
      data: box ? box.data : null,
      updatedAt: (box && box.updatedAt) || '',
      updatedBy: (box && box.updatedBy) || ''
    };
  } catch (error) {
    logError(MODULE_STORE, 'storeRead_', error, `name=${name}`);
    throw error;
  }
}

/**
 * 書き込む。**読んだときの rev と今の rev が違えば書かない。**
 *
 * 衝突したときは、いま入っている中身をそのまま返す。画面はそれを見せて
 * 「読み直す」か「自分の内容で上書きする」かを選ばせる。
 * 中身を返さずに「衝突しました」だけ言うと、何が違うのか分からない。
 *
 * @param {string} name ファイル名
 * @param {number} baseRev 読んだときの版。0 は「まだ無いはず」
 * @param {Object} data 書く中身
 * @param {boolean} force true なら版を見ずに上書きする（画面で選んだときだけ）
 * @return {{ok:boolean, rev:number, conflict:Object|undefined}}
 */
function storeWrite_(name, baseRev, data, force) {
  const started = Date.now();
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(STORE_LOCK_WAIT_MS)) {
      throw new Error('ほかの保存が終わるのを待てませんでした。少し置いて試してください');
    }
    const now = storeRead_(name);
    if (!force && Number(baseRev) !== now.rev) {
      logSuccess(MODULE_STORE, 'storeWrite_',
        `conflict; name=${name}; base=${baseRev}; now=${now.rev}`);
      return { ok: false, rev: now.rev, conflict: now };
    }

    const box = {
      rev: now.rev + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: storeWho_(),
      appVersion: CONFIG.APP_VERSION,
      data: data
    };
    const text = JSON.stringify(box);
    if (text.length > STORE_MAX_BYTES) {
      throw new Error('保存する内容が大きすぎます: ' + text.length + ' バイト');
    }

    const file = storeFileOrNull_(name);
    if (file) file.setContent(text);
    else storeFolder_().createFile(name, text, 'application/json');

    logSuccess(MODULE_STORE, 'storeWrite_',
      `name=${name}; rev=${box.rev}; bytes=${text.length}; `
      + `elapsedMs=${Date.now() - started}`);
    return { ok: true, rev: box.rev };
  } catch (error) {
    logError(MODULE_STORE, 'storeWrite_', error, `name=${name}; base=${baseRev}`);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * いま書いている人。分からなければ空。
 * 衝突したときに「誰の編集とぶつかったか」を出すために持つ。
 */
function storeWho_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (ignored) {
    return '';                       // 権限が無いデプロイでは取れない
  }
}
