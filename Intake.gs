/**
 * Intake.gs — レセコンからの日次実績の受け口
 *
 * 仕様: docs/RECEIPT-API.md / 特徴量: docs/FEATURE-COLLECTION.md
 *
 * ベンダー（シグマ）に依存しない**正規形**をこちらで定義し、変換はアダプタが担う。
 * こうしておくと、
 *   - ベンダーとの交渉が「この形に寄せられますか」で済む
 *   - レセコンを替えてもアダプタの差し替えで済む
 *   - サンプルデータが来る前に、検証と保存を書いて試せる
 *
 * 経路は3つ。どれを使っても同じ正規形に落ちてから中へ入る。
 *   A. CSV 手動アップロード（まずこれ。API が無くても始められる）
 *   B. Drive のフォルダ監視
 *   C. Web API（doPost）
 *
 * このファイルで**実装済みなのは契約の部分だけ**（検証・正規化・項目定義）。
 * 経路とアダプタはサンプルデータが来てから書く。
 */

const MODULE_INTAKE = 'Intake';

/**
 * 受け取る項目の定義。**ここが仕様そのもの。**
 *
 * unit は「1件が何を指すか」。ベンダーとの合意事項で、
 * ここが食い違うと数字が数倍変わり、あとから遡って直せない。
 */
const INTAKE_SCHEMA = Object.freeze({
  counts: Object.freeze({
    prescriptions:     { label: '処方箋枚数',                 unit: '枚' },
    newPatients:       { label: '新患',                       unit: '人' },
    onePack:           { label: '一包化加算',                 unit: '算定回数' },
    mixing:            { label: '計量混合調剤加算',           unit: '算定回数' },
    compounding:       { label: '自家製剤加算',               unit: '算定回数' },
    duplicationCheck:  { label: '重複投薬・相互作用等防止加算', unit: '算定回数' },
    narcotics:         { label: '麻薬管理指導加算',           unit: '算定回数' },
    homeVisit:         { label: '在宅患者訪問薬剤管理指導料', unit: '算定回数' },
    internalDrugUnits: { label: '内服薬の剤数',               unit: '剤' },
  }),
  /** 処方日数 → 件数。N日後の再来を積み上げるために使う */
  dispenseDays: { label: '処方日数の分布', unit: '件' },
  /** 医師コード → 枚数 */
  byDoctor: { label: '医師ごとの処方箋枚数', unit: '枚' },
});

/** 取り込みの経路 */
const INTAKE_SOURCE = Object.freeze({
  CSV: 'csv',
  DRIVE: 'drive',
  API: 'api',
});

/**
 * 正規形を検証する。
 *
 * 行単位で見て、通った行と弾いた行を分けて返す。
 * 1行の不備で全体を止めない。止めると、直すまで何も溜まらない。
 *
 * @param {Object} payload 正規形のペイロード
 * @return {{ok: Array<Object>, ng: Array<{index: number, reason: string}>}}
 */
function validateIntake_(payload) {
  const ok = [];
  const ng = [];
  try {
    if (!payload || !Array.isArray(payload.records)) {
      return { ok: ok, ng: [{ index: -1, reason: 'records が配列ではありません' }] };
    }
    payload.records.forEach((rec, i) => {
      const reason = intakeRowError_(rec);
      if (reason) ng.push({ index: i, reason: reason });
      else ok.push(rec);
    });
    return { ok: ok, ng: ng };
  } catch (error) {
    logError(MODULE_INTAKE, 'validateIntake_', error, JSON.stringify(payload).slice(0, 500));
    return { ok: [], ng: [{ index: -1, reason: String(error && error.message) }] };
  }
}

/** 1行を見て、駄目な理由を返す。問題なければ空文字 */
function intakeRowError_(rec) {
  if (!rec || typeof rec !== 'object') return '行がオブジェクトではありません';
  if (!rec.storeCode) return 'storeCode がありません';
  if (!isIsoDate_(rec.date)) return 'date が yyyy-mm-dd ではありません: ' + rec.date;

  const counts = rec.counts || {};
  const keys = Object.keys(counts);
  for (let i = 0; i < keys.length; i++) {
    const v = counts[keys[i]];
    if (v === null || v === undefined || v === '') continue;   // 欠測は許す
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
      return keys[i] + ' が 0 以上の数ではありません: ' + v;
    }
  }
  if (rec.dispenseDays) {
    const dd = Object.keys(rec.dispenseDays);
    for (let i = 0; i < dd.length; i++) {
      if (!/^\d+$/.test(dd[i])) return '処方日数が整数ではありません: ' + dd[i];
    }
  }
  return '';
}

/** yyyy-mm-dd か。実在する日付かまで見る（2026-02-30 を弾く） */
function isIsoDate_(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const p = v.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2]);
  return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
}

/**
 * 1行を保存できる形に正規化する。
 *
 * **欠測と 0 を区別する。** 項目が来なかった日と 0 件だった日は別物なので、
 * 欠測は null のままにして 0 で埋めない。埋めると「その日は暇だった」と
 * 誤って学習される。
 *
 * **契約に無いキーは捨てず extra に残す。** 捨てると、あとで
 * 「その項目も欲しかった」となったときに遡れない。
 *
 * @param {Object} rec 検証を通った1行
 * @param {Object} meta {source, fetchedAt}
 * @return {Object} 保存用のオブジェクト
 */
function normalizeRecord_(rec, meta) {
  const counts = rec.counts || {};
  const out = {
    storeCode: String(rec.storeCode),
    date: rec.date,
    source: (meta && meta.source) || '',
    fetchedAt: (meta && meta.fetchedAt) || new Date().toISOString(),
  };

  Object.keys(INTAKE_SCHEMA.counts).forEach(key => {
    const v = counts[key];
    out[key] = (v === null || v === undefined || v === '') ? null : Number(v);
  });

  out.dispenseDays = rec.dispenseDays || null;
  out.byDoctor = rec.byDoctor || null;

  // 契約に無いキー
  const known = Object.keys(INTAKE_SCHEMA.counts);
  const extra = {};
  Object.keys(counts).forEach(k => { if (known.indexOf(k) < 0) extra[k] = counts[k]; });
  out.extra = Object.keys(extra).length ? extra : null;

  return out;
}

/**
 * 取り込みの本体。経路によらずここを通る。
 *
 * @param {Object} payload 正規形
 * @return {{saved: number, rejected: Array<Object>}}
 */
function intake(payload) {
  try {
    const meta = {
      source: (payload && payload.source) || '',
      fetchedAt: (payload && payload.fetchedAt) || new Date().toISOString(),
    };
    const checked = validateIntake_(payload);
    const rows = checked.ok.map(r => normalizeRecord_(r, meta));
    const saved = upsertDaily_(rows);
    if (checked.ng.length) {
      logError(MODULE_INTAKE, 'intake',
        checked.ng.length + ' 行を取り込めませんでした',
        JSON.stringify(checked.ng).slice(0, 900));
    }
    logSuccess(MODULE_INTAKE, 'intake',
      `取り込み ${saved} 行 / 除外 ${checked.ng.length} 行 / 出所 ${meta.source}`);
    return { saved: saved, rejected: checked.ng };
  } catch (error) {
    logError(MODULE_INTAKE, 'intake', error, '', true);
    throw error;
  }
}

/* ═══ ここから下は未実装 ══════════════════════════════════
   サンプルデータが来てから書く。契約（上）は先に固めてある。 */

/**
 * 日次実績シートへ書く。**冪等**にすること。
 * 店舗ID × 日付 で upsert し、追記しない。
 * レセコンの値はあとから確定するので、再取り込みは日常的に起きる。
 * @param {Array<Object>} rows 正規化済みの行
 * @return {number} 書いた行数
 */
function upsertDaily_(rows) {
  return notImplemented_(MODULE_INTAKE, 'upsertDaily_', 9); // TODO(P9)
}

/** 経路A: CSV を手で選んで取り込む */
function importFromCsv(csvText) {
  return notImplemented_(MODULE_INTAKE, 'importFromCsv', 9); // TODO(P9)
}

/** 経路B: Drive のフォルダに置かれた CSV を時間主導トリガで拾う */
function watchDriveFolder() {
  return notImplemented_(MODULE_INTAKE, 'watchDriveFolder', 9); // TODO(P9)
}

/**
 * 経路C: Web API。X-Api-Key をスクリプトプロパティと突き合わせること。
 * GAS の Web アプリは URL を知られると誰でも叩けるので、
 * 「リンクを知っている全員」で公開するなら認証は必須。
 */
function doPostIntake(e) {
  return notImplemented_(MODULE_INTAKE, 'doPostIntake', 9); // TODO(P9)
}

/**
 * シグマの出力を正規形へ直す。
 * **サンプルデータが来てから書く。** 想像で書くと必ず外れる。
 * @param {Array<Object>} raw ベンダーの生データ
 * @return {Object} 正規形のペイロード
 */
function adaptSigma_(raw) {
  return notImplemented_(MODULE_INTAKE, 'adaptSigma_', 9); // TODO(P9)
}
