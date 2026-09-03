# AutoShiftGenerator（GAS 版）

薬局のシフト表を Google スプレッドシート上で自動作成する Google Apps Script。
Excel VBA 版 [`Auto_Shift_Generator`](https://github.com/Sekine53629/Auto_Shift_Generator)
（11 モジュール / 約 8,900 行）の移植です。

移植の仕様は [`docs/GAS-PORTING-SPEC.md`](docs/GAS-PORTING-SPEC.md) にあります。
**実装に入る前に必ず読んでください。**

---

## 現在の状態

**シフト表シートの生成までは動きます。自動作成（配置エンジン）はまだです。**

| # | 内容 | 状態 |
|---|---|---|
| 1 | `Config.gs` / `Layout.gs` / `Log.gs` / `Menu.gs` | **実装済み** |
| — | `SheetBuilder.gs`（シフト表シートの生成。VBA 版に無い新機能） | **実装済み** |
| 2 | `Schema.gs` / `Setup.gs` | 数式の組み立ては実装済み、シート生成は骨組み |
| 3 | `Engine.gs`（純粋関数） | 骨組み（`isPaidOff` のみ実装済み） |
| 4 | `ShiftAuto.gs` / `Report.gs` / `SettingsCheck.gs` | 設定の読み出しのみ実装済み |
| 5 | `ChangeLog.gs` | 骨組み |
| 6 | `Sidebar.gs` / `Sidebar.html` | 骨組み |
| 7 | `Holidays.gs` / `Export.gs` | 骨組み |
| 8 | `Survey.gs` / ドキュメント | 骨組み |

骨組みの関数は `notImplemented_()` を投げます。残りは `TODO(P1)`〜`TODO(P8)` で追えます
（数字は仕様書 §9 の実装フェーズ）。

```
grep -rn "TODO(P3)" *.gs     # フェーズ3 の残り
```

### テスト

GAS に載せずに検証できる部分は Node で走ります。**スプレッドシートは要りません。**

```
node tests/pure.test.js
```

`.gs` を全部 `vm` に流し込み、GAS のグローバルはスタブで代用します。
一番大事なのは「`SheetBuilder` が決めた行位置を `Layout.resolveLayout()` が
同じ値として読み戻せるか」で、ここが合わないと生成したシートは自動作成に使えません。

---

## 構成

```
AutoShiftGenerator/
├── appsscript.json      マニフェスト（V8 / Asia/Tokyo / OAuth スコープ）
├── Config.gs            定数の一元管理
├── Layout.gs            シート上の位置解決
├── Log.gs               エラー/成功ログ
├── Menu.gs              onOpen とメニュー
├── SheetBuilder.gs      シフト表シートの生成（VBA 版に無い新機能）
├── Engine.gs            ★配置エンジン（SpreadsheetApp を一切呼ばない）
├── ShiftAuto.gs         自動作成の入口・シートの読み書き
├── Report.gs            結果レポートの文字列組み立て
├── SettingsCheck.gs     設定チェック
├── ChangeLog.gs         変更ログ・巻き戻し・白紙化
├── Schema.gs            不足シートの生成
├── Setup.gs             初期設定（数式・名前付き範囲）
├── Holidays.gs          祝日マスタの取込
├── Export.gs            PDF 出力
├── Survey.gs            シート構造の調査
├── Sidebar.gs           サイドバーのサーバ側 API
├── Sidebar.html         サイドバーの UI
├── tests/
│   └── pure.test.js     GAS 不要のテスト（node tests/pure.test.js）
└── docs/
    ├── GAS-PORTING-SPEC.md      移植仕様書
    └── REAL-SHEET-FINDINGS.md   実物のシフト表と仕様書の差分
```

**コンテナバインドスクリプト**であること。`onOpen` / サイドバー / `getActiveRange()`
はバインドでないと動きません。

---

## セットアップ

1. シフト表のスプレッドシートを開き、拡張機能 → Apps Script でエディタを開く
2. このリポジトリの `.gs` / `.html` / `appsscript.json` を貼り付ける
   （`clasp` を使う場合、`.clasp.json` は `.gitignore` 済み）
3. スクリプトプロパティを設定する（プロジェクトの設定 → スクリプト プロパティ）

   | キー | 内容 | 未設定のとき |
   |---|---|---|
   | `ADMIN_EMAIL` | 致命的エラーの通知先 | 実行ユーザー宛 |
   | `EXPORT_FOLDER_ID` | PDF の保存先フォルダ ID | マイドライブ直下 |

   メールアドレスやフォルダ ID はコードに書きません（Tier 1 / Tier 2 のルール）。
4. スプレッドシートを開き直すと「シフト」メニューが出る
5. 初期設定 → 不足シートを生成 → 祝日マスタを取り込む
6. 自動作成設定シートにメンバーを登録する
7. 初期設定 → **シフト表シートを生成** → 年月を入力（例 `2026/9`）

### シフト表シートの生成

`初期設定 → シフト表シートを生成` で、日付・曜日・医師名欄・入力欄・備考行・
集計行・集計列・区分の作業列・条件付き書式まで入った1か月分のシートを作ります。

- シート名は `2026年9月` のように月ごとに分かれます
- **氏名は自動作成設定シートから読むだけ**で、コードには一切書きません。
  未登録なら空行が並びます
- 医師名欄も空で作ります（候補の置き場は自動作成設定の N 列）
- 月の日数より列が多い分（30 日の月の 31 列目など）は灰色になります
- **月別シートには名前付き範囲を貼りません**。名前はブック全体で一意なので
  12 か月分に同じ名前は付けられないためです。位置は `Layout.gs` が計算で解決するので
  名前が無くても動きます

### 必要なシート

`シフト` / `自動作成設定` / `祝日マスタ` / `シフト変更ログ`（+ `実行ログ`）。
無いものは「不足シートを生成」が作ります。生成は**空欄のセルにしか書かない**ので、
既存の値が消えることはありません。

---

## トリガ

| 種別 | 関数 | 内容 |
|---|---|---|
| 簡易トリガ | `onOpen()` | 「シフト」メニューを作る |

インストーラブルトリガは現時点で使いません。
セル直接編集をログに残したい場合は `onEdit` を足すことになりますが、
旧値は `e.oldValue`（単一セル編集時のみ）に限られ、範囲貼り付けでは取れません。

---

## VBA 版から落ちた機能・変わった挙動

移植で意図的に落としたもの、GAS 側の制約で変わったものです。

| 項目 | VBA 版 | GAS 版 |
|---|---|---|
| シート上のパレット3行 | ★マーカー行 / 本体行 / ラベル行 | **生成しない**。サイドバーが引き継ぐ |
| ダブルクリックで記号を順送り | あり | サイドバーの「次へ ▶」 |
| 右クリックで1つ戻す | あり | サイドバーの「◀ 前へ」 |
| 範囲を選んで右クリックで一括 | あり | 範囲を選んでサイドバーのボタン |
| 和暦の表示形式 | `[$-ja-JP]ge"." m"月"`（元号に自動追従） | 年月セルは**西暦**。見出しは `="R"&(YEAR(A1)-2018)&…` の数式で和暦にするが、**元号が変わったら数式を直す必要がある** |
| 月送りのスピンボタン | Forms コントロール | サイドバーの「◀ 前月 / 翌月 ▶」 |
| Excel(.xlsx) 出力 | あり | PDF のみ（必要なら同じ URL の `format=xlsx`） |
| エラー行番号 `Erl` | あり | `error.stack` |
| エラーログの出力先 | `C:\VBAErrorLogs\*.csv` | `console` + `実行ログ` シート + 管理者メール |
| 祝日の取込 | Power Query（Excel 2016 以降） | `UrlFetchApp`（バージョン制限なし） |
| 手動変更のログ | `Worksheet_Change` で全編集を捕捉 | **サイドバー経由の変更のみ**。セル直接編集は残らない |

### 追加した制限（VBA 版に無いもの）

- **`CB_2名移す` の打ち切り `CB_CHAIN_MAX_PASS = 50`**
  （[`Config.gs`](Config.gs) の `ENGINE_LIMIT`）

  `CoverBalance` は最大 500 巡回りますが、その全部が玉突き（2名移す）に落ちると
  約 60 億ステップになり、GAS の 6 分制限（一般アカウント）を確実に超えます。
  VBA 版にはこの制限がありません。**同じ入力でも VBA 版と結果が変わりうる唯一の箇所**なので、
  移植の突き合わせで差が出たらまずここを疑ってください。

### 名前付き範囲の扱い

Sheets の名前付き範囲は**数式を持てず、範囲アドレスしか持てません**。
VBA 版は `OFFSET` / `INDEX` の相対参照だったため行の増減に追随しましたが、
GAS 版は貼り直すまで古いままになります。

そのため **`Layout.gs` の計算解決を正**とし、名前付き範囲は利用者向けの目印
という位置づけです。両者のずれは「設定チェック」が警告します。

---

## 実行時間

| アカウント | 上限 |
|---|---|
| 一般（@gmail.com） | 6 分 |
| Workspace | 30 分 |

配置エンジン（`Engine.gs`）は `SpreadsheetApp` を一切呼ばない純粋関数です。
シートの読み書きは工程の前後に範囲まるごと1回ずつ。
この設計を崩すと API 呼び出しが数万回になり、確実に時間切れになります。

---

## 参照

- 移植仕様書: [`docs/GAS-PORTING-SPEC.md`](docs/GAS-PORTING-SPEC.md)
- VBA 版: [Sekine53629/Auto_Shift_Generator](https://github.com/Sekine53629/Auto_Shift_Generator)
- 内閣府 祝日 CSV: <https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv>
