/**
 * Engine.gs — 配置エンジン（★最重要）
 *
 * 移植元: ShiftAutoPlace v9.13.0 + AutoShiftGenerator の工程 6〜11 +
 *         ShiftAutoLog の計測ヘルパー
 * 仕様書: §4（工程と各工程の仕様）/ §8（実行時間）/ §10（罠チェックリスト）
 *
 * ┌────────────────────────────────────────────────┐
 * │ 【絶対の約束】このファイルは SpreadsheetApp を一切呼ばない。   │
 * │ 呼んだ時点で 6 分制限に当たり、テストも書けなくなる（§8.3-1）。 │
 * └────────────────────────────────────────────────┘
 *
 * VBA 版が工程の途中で mGrid.Cells(i,j).Value を読んでいた箇所
 * （AS_公休ノルマ の IsPaidOff 判定 / AP_既存記号を数える / AP_日別既存数 /
 *   AP_日別遅番数 / AP_レポート個人別）は、すべて input.existing[][] を
 * 参照する形に置き換えること。ここを見落とすと API 呼び出しが数万回になる。
 *
 * 【移植の検証（§9 フェーズ3）】
 *   VBA 版と同じ入力を与えて同じ出力になるかを突き合わせる。
 *   差が出たらエンジン側のバグとして扱い、アルゴリズムを「改善」しない。
 */

const MODULE_ENGINE = 'Engine';

/**
 * 配置エンジンの入口。純粋関数（同じ入力なら必ず同じ出力）。
 *
 * @param {{
 *   settings: {earlyN:number, lateMin:number, maxRun:number, maxOffRun:number,
 *              weekBase:number, reqPlus:number, paidSyms:string, gSym:string,
 *              clerkEarlyN:number, lateBusy:number, runBonus:number},
 *   days: Array<{date:Date, inMonth:boolean, weekday:number, isHoliday:boolean,
 *                docCount:number, required:number, weekKey:number}>,
 *   members: Array<{name:string, kind:string, rule:string, leave:boolean,
 *                   canLate:boolean, quota:number, weekN:number,
 *                   fixedDow:boolean[], skipRow:boolean}>,
 *   existing: string[][]
 * }} input 行×日の生データ。weekday は 1=日..7=土。quota の -1 は未指定
 * @return {{plan:number[][], symbol:string[][],
 *           counts:{cntE:number[], cntM:number[], cntL:number[]},
 *           targetOff:number, unmet:string[],
 *           diagnostics:{coverBalance:Object, fiveBalance:Object}}}
 */
function runEngine(input) {
  return notImplemented_(MODULE_ENGINE, 'runEngine', 3); // TODO(P3)
}

/* ================================================================
 *  工程 6〜11（移植元: AutoShiftGenerator.bas の AS_*）
 * ================================================================ */

/**
 * 工程6 既存分類 — 入力済みセルを ST_FWORK / ST_FOFF に分類する。
 *   ○ ◯ ● ▲ → ST_FWORK / それ以外の非空文字 → ST_FOFF / 空白 → ST_NONE
 * 【不変条件】ST_FWORK / ST_FOFF は以降の工程で絶対に書き換えない。
 * 移植元: AS_既存分類
 */
function classifyExisting_(state) {
  return notImplemented_(MODULE_ENGINE, 'classifyExisting_', 3); // TODO(P3)
}

/**
 * 工程7 ルール適用 — 固定曜日 / 手動=触らない / それ以外は仮で全出勤。
 * 移植元: AS_ルール適用
 */
function applyMemberRules_(state) {
  return notImplemented_(MODULE_ENGINE, 'applyMemberRules_', 3); // TODO(P3)
}

/**
 * 工程8 予定出勤数 — 日ごとの出勤数を薬剤師(cov)と事務員(covG)で別に数える。
 * 移植元: AS_予定出勤数
 */
function countCoverage_(state) {
  return notImplemented_(MODULE_ENGINE, 'countCoverage_', 3); // TODO(P3)
}

/**
 * 工程9 週N日ルール — 週ごとの勤務日数を指定数まで絞る。
 * 移植元: AS_週N日ルール
 */
function applyWeekNRule_(state) {
  return notImplemented_(MODULE_ENGINE, 'applyWeekNRule_', 3); // TODO(P3)
}

/**
 * 工程10 週リスト — 日曜起点の週キーを昇順に並べる。
 *   weekKey = 日付シリアル - (曜日(日=1) - 1)
 * 移植元: AS_週リスト
 */
function buildWeekList_(state) {
  return notImplemented_(MODULE_ENGINE, 'buildWeekList_', 3); // TODO(P3)
}

/**
 * 工程11 公休ノルマ — 週の基本休を置き、余剰は連休化する。
 *
 * 仕様（§4.4）:
 *   1. remOff = quota - (ノルマ対象の既存休の数)。quota 未指定なら targetOff。
 *      ノルマ外の休み記号（既定 有休・夏休）に部分一致するものは数えない。
 *   2. 週ごとの目標休日数 tW を組む。
 *      tW = weekBase - (その週の既存休)、その週の残り日数を超えない。
 *      その週の月内日数が2日以下なら tW は最大1（月初/月末の端週）。
 *      合計が remOff を超えるなら後ろの週から1ずつ削る（最大100巡）。
 *      足りないなら前の週から1ずつ足す（maxOffRun が上限。最大100巡）。
 *   3. 週ごとに 3連休 → 2連休 → 単発 の順で置く。
 * 移植元: AS_公休ノルマ
 */
function placeOffQuota_(state) {
  return notImplemented_(MODULE_ENGINE, 'placeOffQuota_', 3); // TODO(P3)
}

/* ================================================================
 *  工程 12〜17（移植元: ShiftAutoPlace.bas）
 * ================================================================ */

/**
 * 工程12 残ノルマ配置 — 残りを offScore + adjBonus が最大の出勤日へ1日ずつ。
 * 置けなくなったら unmet に「あとn日 配置できず」を記録して打ち切る（誤差0厳守）。
 * 移植元: AS_残ノルマ配置
 */
function placeRemainingQuota_(state) {
  return notImplemented_(MODULE_ENGINE, 'placeRemainingQuota_', 3); // TODO(P3)
}

/**
 * 工程13 連勤緩和 — 連勤上限超えを入替で緩和（最大 REPAIR_RUNS_PASS 巡）。
 * 移植元: AS_連勤緩和
 */
function relaxWorkRuns_(state) {
  return notImplemented_(MODULE_ENGINE, 'relaxWorkRuns_', 3); // TODO(P3)
}

/**
 * 工程16 記号割当 — ○ → ▲ → 残りを ● ▲ で均等。
 * 移植元: AS_記号割当
 */
function assignSymbols_(state) {
  return notImplemented_(MODULE_ENGINE, 'assignSymbols_', 3); // TODO(P3)
}

/**
 * その日を休みにする良さ（大きいほど休み向き）。式は §4.4 のとおり一字も変えない。
 * 移植元: OffScore
 * @return {number}
 */
function offScore_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'offScore_', 3); // TODO(P3)
}

/**
 * 既存休に隣接して連休になる位置を優遇する加点。
 *   total = 1 + offRunBefore + offRunAfter
 *   2 <= total <= maxOffRun → +4 / total > maxOffRun → -3 * (total - maxOffRun)
 * 移植元: AdjBonus
 */
function adjBonus_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'adjBonus_', 3); // TODO(P3)
}

/** 連休ブロック（3連休/2連休）を1つ置く。移植元: PlaceOffBlock */
function placeOffBlock_(state, i, weekKey, size) {
  return notImplemented_(MODULE_ENGINE, 'placeOffBlock_', 3); // TODO(P3)
}

/** 単発の休みを1つ置く。移植元: PlaceOffSingle */
function placeOffSingle_(state, i, weekKey) {
  return notImplemented_(MODULE_ENGINE, 'placeOffSingle_', 3); // TODO(P3)
}

/**
 * 1人分の連勤緩和。
 *   - 固定曜日 の人は対象外（その曜日に出るのが約束。動かすと崩れる）
 *   - 週N日 の人は同じ週の中だけで入れ替える
 *   - 連勤の中央に近い出勤日から順に候補にし、ST_OFF の日と入れ替える
 *   - 入替先は workRunIf_(i,k) <= maxRun を満たす日のうち不足が最大の日
 * 移植元: RepairRuns
 */
function repairRuns_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'repairRuns_', 3); // TODO(P3)
}

/** 2つの日が同じ週か。移植元: RR_同じ週か */
function isSameWeek_(state, j, k) {
  return notImplemented_(MODULE_ENGINE, 'isSameWeek_', 3); // TODO(P3)
}

/* ---- 記号割当の内部（移植元: AP_*） ---- */

/** 既存入力の記号を個人別に数える。existing[][] だけを見る。移植元: AP_既存記号を数える */
function countExistingSymbols_(state) {
  return notImplemented_(MODULE_ENGINE, 'countExistingSymbols_', 3); // TODO(P3)
}

/** ある日の既存の記号数。移植元: AP_日別既存数 */
function countDayExisting_(state, j, sym) {
  return notImplemented_(MODULE_ENGINE, 'countDayExisting_', 3); // TODO(P3)
}

/**
 * その記号の月合計が最少の人を選ぶ。
 * 同点のとき走査開始位置を日ごとにずらす（i = ((j + k - 1) % nP) + 1）。
 * 常に上の行を選ぶと1人に記号が偏るため。乱数ではないので再現性は保たれる。
 * 移植元: AP_最少候補
 */
function pickLeastSymbolCandidate_(state, j, sym) {
  return notImplemented_(MODULE_ENGINE, 'pickLeastSymbolCandidate_', 3); // TODO(P3)
}

/** 記号を1つ置き、カウンタを更新する。移植元: AP_記号を置く */
function putSymbol_(state, i, j, sym) {
  return notImplemented_(MODULE_ENGINE, 'putSymbol_', 3); // TODO(P3)
}

/**
 * その日の遅番目標人数。
 *   lateBusy > 0 && docCount[j] >= DOC_BUSY_N なら lateBusy、他は lateMin
 * 移植元: AP_遅番目標
 */
function lateTarget_(state, j) {
  return notImplemented_(MODULE_ENGINE, 'lateTarget_', 3); // TODO(P3)
}

/** 薬剤師の記号: ○ を earlyN 人まで → ▲ を lateTarget まで → 残りは ● ▲ 交互。移植元: AP_薬剤師の記号 */
function assignPharmSymbols_(state, j) {
  return notImplemented_(MODULE_ENGINE, 'assignPharmSymbols_', 3); // TODO(P3)
}

/** 事務員の記号: ○ を clerkEarlyN 人まで → 以降は gSym。移植元: AP_事務員の記号 */
function assignClerkSymbols_(state, j) {
  return notImplemented_(MODULE_ENGINE, 'assignClerkSymbols_', 3); // TODO(P3)
}

/** ここまでで記号が付かなかった出勤は ○ にする。移植元: AP_残りは早番 */
function assignRestAsEarly_(state, j) {
  return notImplemented_(MODULE_ENGINE, 'assignRestAsEarly_', 3); // TODO(P3)
}

/* ================================================================
 *  工程14 CoverBalance — 日別の過不足を均す
 *  移植元: CoverBalance / CB_*
 * ================================================================ */

/**
 * 評価 score = Σ max(0, required[j] - cov[j])^2（小さいほど良い。過剰は0扱い）。
 * 手番: cbMoveOne_ → 届かなければ cbMoveTwo_ → どちらも無ければ終了。
 * 上限: ENGINE_LIMIT.CB_MAX_PASS。
 *
 * 【落とし穴】連勤/連休の判定は「交換した後の盤面」で行う（v9.6.0 の修正）。
 * 交換前に見ると、抜く日が入れる日の隣にあるとき、まだ出勤のままの抜く日を
 * 連勤に数えて、実際には収まる交換まで弾いてしまう。
 * 実装は「一旦入れ替えて測り、必ず戻す」。例外時も必ず戻すこと。
 */
function coverBalance_(state) {
  return notImplemented_(MODULE_ENGINE, 'coverBalance_', 3); // TODO(P3)
}

/**
 * 1手も動かないときの切り分けに使う診断文字列。§7.1 のとおり必ず移植する。
 * 形式: shortDays=..; movable=..; canWork=..; canRest=..; rawPairs=..; pairs=..; blkRun=..; blkOff=..
 * 移植元: CB_診断
 */
function cbDiagnose_(state) {
  return notImplemented_(MODULE_ENGINE, 'cbDiagnose_', 3); // TODO(P3)
}

/** 交換後の盤面で連勤上限を超えるか。移植元: CB_連勤で消えたか */
function cbRunVanished_(state, i, jTo, jFrom) {
  return notImplemented_(MODULE_ENGINE, 'cbRunVanished_', 3); // TODO(P3)
}

/** 評価値。移植元: CB_評価 */
function cbScore_(state) {
  return notImplemented_(MODULE_ENGINE, 'cbScore_', 3); // TODO(P3)
}

/**
 * 1名を移す。1手あたりの評価値は総当たりせず score - (2d - 1) で確定できる
 * （d = 入れる日の不足）。cbCanLeave_ の条件を緩めるときはこの式も見直すこと。
 * 移植元: CB_1名移す
 */
function cbMoveOne_(state) {
  return notImplemented_(MODULE_ENGINE, 'cbMoveOne_', 3); // TODO(P3)
}

/** 対象者か: 薬剤師 かつ 手動でない かつ 固定曜日でない かつ 休業でない。移植元: CB_対象者か */
function cbIsTarget_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'cbIsTarget_', 3); // TODO(P3)
}

/**
 * その日に入れられるか（ST_OFF かつ その日が不足）。
 * 希望休・有休（ST_FOFF）は絶対に触らない。移植元: CB_入れられるか
 */
function cbCanInsert_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'cbCanInsert_', 3); // TODO(P3)
}

/** その日を休みにできるか。移植元: CB_休みにできるか */
function cbCanRest_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'cbCanRest_', 3); // TODO(P3)
}

/** 抜けるか（ST_WORK かつ 抜いてもその日が必要数を保てる）。移植元: CB_抜けるか */
function cbCanLeave_(state, i, j, jTo) {
  return notImplemented_(MODULE_ENGINE, 'cbCanLeave_', 3); // TODO(P3)
}

/** 連勤上限 = maxRun + runBonus（不足を埋めるときだけ上乗せを許す）。移植元: CB_連勤上限 */
function cbRunLimit_(state) {
  return notImplemented_(MODULE_ENGINE, 'cbRunLimit_', 3); // TODO(P3)
}

/** 交換できるか（週N日 の人は同じ週内に限る）。移植元: CB_交換できるか */
function cbCanSwap_(state, i, jTo, jFrom) {
  return notImplemented_(MODULE_ENGINE, 'cbCanSwap_', 3); // TODO(P3)
}

/** 抜ける日を選ぶ。移植元: CB_抜ける日 */
function cbPickLeaveDay_(state, i, jTo) {
  return notImplemented_(MODULE_ENGINE, 'cbPickLeaveDay_', 3); // TODO(P3)
}

/**
 * 2名の玉突き: A が不足日 D に入り中継日 X を手放す → B が X を引き受け
 * 余裕のある Y を手放す。D は +1、X は差し引き 0、Y は -1。
 * 誰の月間休日数も変わらない。
 * 打ち切りは ENGINE_LIMIT.CB_CHAIN_MAX_PASS（VBA 版に無い GAS 独自の制限。
 * 500 巡すべてが玉突きに落ちると 60 億ステップになるため。README に明記済み）。
 * 移植元: CB_2名移す
 */
function cbMoveTwo_(state) {
  return notImplemented_(MODULE_ENGINE, 'cbMoveTwo_', 3); // TODO(P3)
}

/** 不足日か。移植元: CB_不足日か */
function cbIsShortDay_(state, j) {
  return notImplemented_(MODULE_ENGINE, 'cbIsShortDay_', 3); // TODO(P3)
}

/** 中継日か。移植元: CB_中継日か */
function cbIsRelayDay_(state, i, jTo, jX) {
  return notImplemented_(MODULE_ENGINE, 'cbIsRelayDay_', 3); // TODO(P3)
}

/** 引き受けられるか。移植元: CB_引き受けられるか */
function cbCanAccept_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'cbCanAccept_', 3); // TODO(P3)
}

/** 玉突きを実際に打つ。移植元: CB_玉突きを打つ */
function cbApplyChain_(state, a, d, x, b, y) {
  return notImplemented_(MODULE_ENGINE, 'cbApplyChain_', 3); // TODO(P3)
}

/* ================================================================
 *  工程15 FiveBalance — 混雑日（医師 DOC_BUSY_N 名）の出勤回数を個人間で均す
 *  移植元: FiveBalance / FB_*
 * ================================================================ */

/**
 * 対象者は 通常 ルールの薬剤師のみ（固定曜日・週N日は別ルールで決まる）。
 * 手番の優先順: fbSwapSameDay_ → fbLiftToBusy_ → fbDropFromBusy_。
 * 打ち切り ENGINE_LIMIT.FB_MAX_PASS。差が1以下になったら終了。
 *
 * 【落とし穴】ここでの連勤上限は maxRun（上乗せ前）。
 * 上乗せは不足日を埋めるための例外であって、個人差を均すために使うものではない。
 */
function fiveBalance_(state) {
  return notImplemented_(MODULE_ENGINE, 'fiveBalance_', 3); // TODO(P3)
}

/** 混雑日出勤の最多・最少の人を返す。移植元: FB_最多最少 */
function fbMaxMin_(state) {
  return notImplemented_(MODULE_ENGINE, 'fbMaxMin_', 3); // TODO(P3)
}

/** 対象者か（通常ルールの薬剤師のみ）。移植元: FB_対象者か */
function fbIsTarget_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'fbIsTarget_', 3); // TODO(P3)
}

/** 差が2以上ある全ての組を差の大きい順に試す（v9.13.0）。移植元: FB_どれかの組で交換 */
function fbSwapAnyPair_(state) {
  return notImplemented_(MODULE_ENGINE, 'fbSwapAnyPair_', 3); // TODO(P3)
}

/** 指定の差の組で交換を試す。移植元: FB_この差の組で交換 */
function fbSwapPairWithDiff_(state, diff) {
  return notImplemented_(MODULE_ENGINE, 'fbSwapPairWithDiff_', 3); // TODO(P3)
}

/** 診断文字列。§7.1 のとおり必ず移植する。移植元: FB_診断 */
function fbDiagnose_(state) {
  return notImplemented_(MODULE_ENGINE, 'fbDiagnose_', 3); // TODO(P3)
}

/** 差が2以上の組の数。移植元: FB_差2以上の組数 */
function fbCountPairsDiff2_(state) {
  return notImplemented_(MODULE_ENGINE, 'fbCountPairsDiff2_', 3); // TODO(P3)
}

/** 交換後の盤面で連勤上限を超えるか。移植元: FB_連勤で消えたか */
function fbRunVanished_(state, hi, lo, jBusy, jFree) {
  return notImplemented_(MODULE_ENGINE, 'fbRunVanished_', 3); // TODO(P3)
}

/** 混雑日へ乗せる（余裕のある非混雑日と入れ替える）。移植元: FB_混雑日へ乗せる */
function fbLiftToBusy_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'fbLiftToBusy_', 3); // TODO(P3)
}

/** 混雑日から降ろす（その日が必要数を保てるときだけ）。移植元: FB_混雑日から降ろす */
function fbDropFromBusy_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'fbDropFromBusy_', 3); // TODO(P3)
}

/** 余裕のある出勤日を1つ返す。移植元: FB_余裕のある出勤日 */
function fbSpareWorkDay_(state, i, exceptJ) {
  return notImplemented_(MODULE_ENGINE, 'fbSpareWorkDay_', 3); // TODO(P3)
}

/**
 * 同日で交換 — 混雑日で多い人↔少ない人を交換し、非混雑日で逆向きに戻す。
 * 日別の人数も休日数も変わらず、混雑日の出勤回数だけが動く。
 * 移植元: FB_同日で交換
 */
function fbSwapSameDay_(state, hi, lo) {
  return notImplemented_(MODULE_ENGINE, 'fbSwapSameDay_', 3); // TODO(P3)
}

/** 渡せる混雑日か。移植元: FB_渡せる混雑日か */
function fbCanGiveBusyDay_(state, hi, lo, j) {
  return notImplemented_(MODULE_ENGINE, 'fbCanGiveBusyDay_', 3); // TODO(P3)
}

/** 戻せる非混雑日か。移植元: FB_戻せる非混雑日か */
function fbCanReturnNonBusyDay_(state, hi, lo, j) {
  return notImplemented_(MODULE_ENGINE, 'fbCanReturnNonBusyDay_', 3); // TODO(P3)
}

/** 2人で入替できるか。移植元: FB_2人で入替できるか */
function fbCanSwapTwo_(state, hi, lo, jBusy, jFree) {
  return notImplemented_(MODULE_ENGINE, 'fbCanSwapTwo_', 3); // TODO(P3)
}

/** 2人の入替を打つ。移植元: FB_2人の入替を打つ */
function fbApplySwapTwo_(state, hi, lo, jBusy, jFree) {
  return notImplemented_(MODULE_ENGINE, 'fbApplySwapTwo_', 3); // TODO(P3)
}

/* ================================================================
 *  工程17 SymbolBalance
 * ================================================================ */

/**
 * 同じ日に出勤している2人の間で記号を交換し、○●▲ 各々の個人差を2以内に収める。
 * 最大 ENGINE_LIMIT.SYMBOL_MAX_PASS 巡。手動ルールは対象外。
 * ▲ を渡す相手は canLate の人に限る。
 * 移植元: SymbolBalance
 */
function symbolBalance_(state) {
  return notImplemented_(MODULE_ENGINE, 'symbolBalance_', 3); // TODO(P3)
}

/* ================================================================
 *  計測ヘルパー（移植元: ShiftAutoLog.bas の純粋関数部）
 *  ここも SpreadsheetApp を呼ばない。
 * ================================================================ */

/** 個人 i の記号 sym の月合計。移植元: SymCnt */
function symCount_(state, i, sym) {
  return notImplemented_(MODULE_ENGINE, 'symCount_', 3); // TODO(P3)
}

/** 記号カウンタを d だけ増減。移植元: AddCnt */
function addSymCount_(state, i, sym, d) {
  return notImplemented_(MODULE_ENGINE, 'addSymCount_', 3); // TODO(P3)
}

/** j を含む連勤の長さ。左右の伸び（lft / rgt）も返す。移植元: RunLenAt */
function runLenAt_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'runLenAt_', 3); // TODO(P3)
}

/** k を出勤にしたときの連勤長。移植元: WorkRunIf */
function workRunIf_(state, i, k) {
  return notImplemented_(MODULE_ENGINE, 'workRunIf_', 3); // TODO(P3)
}

/** j を休みにしたときの連休長。移植元: OffRunIf */
function offRunIf_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'offRunIf_', 3); // TODO(P3)
}

/** j の直前に続く休みの数。移植元: OffRunBefore */
function offRunBefore_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'offRunBefore_', 3); // TODO(P3)
}

/** j の直後に続く休みの数。移植元: OffRunAfter */
function offRunAfter_(state, i, j) {
  return notImplemented_(MODULE_ENGINE, 'offRunAfter_', 3); // TODO(P3)
}

/** 個人 i の混雑日出勤回数。移植元: FiveCnt */
function fiveCnt_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'fiveCnt_', 3); // TODO(P3)
}

/** 対象者全員の混雑日出勤回数の平均。移植元: FiveAvg */
function fiveAvg_(state) {
  return notImplemented_(MODULE_ENGINE, 'fiveAvg_', 3); // TODO(P3)
}

/** 個人 i の最大連勤。判定不能なら ENGINE_LIMIT.CNT_LARGE。移植元: MaxRun */
function maxRunOf_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'maxRunOf_', 3); // TODO(P3)
}

/** 個人 i の最大連休。移植元: MaxOffRun */
function maxOffRunOf_(state, i) {
  return notImplemented_(MODULE_ENGINE, 'maxOffRunOf_', 3); // TODO(P3)
}

/** 日別出勤数カウンタを d だけ増減（薬剤師 cov / 事務員 covG を区別）。移植元: CovAdd */
function covAdd_(state, i, j, d) {
  return notImplemented_(MODULE_ENGINE, 'covAdd_', 3); // TODO(P3)
}

/** 固定曜日の文字列（例 "月火金土"）を boolean[7] に展開する。移植元: ParseWD */
function parseFixedDow(text) {
  return notImplemented_(MODULE_ENGINE, 'parseFixedDow', 3); // TODO(P3)
}

/**
 * 公休ノルマに数えない休みか。
 * 【必ず部分一致】設定 L11 に「有休」とだけ書けば「有休※」も外れる、という約束。
 * 集計列 AH/AI の振り分け（Setup.gs）もこの関数と同じ規則にすること（§5.4）。
 * 移植元: IsPaidOff
 * @param {string} value セルの文字列
 * @param {string} paidSyms 設定 L11 の値（カンマ区切り）
 * @return {boolean}
 */
function isPaidOff(value, paidSyms) {
  return notImplemented_(MODULE_ENGINE, 'isPaidOff', 3); // TODO(P3)
}
