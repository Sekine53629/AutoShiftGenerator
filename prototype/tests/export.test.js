// .xlsx を組み立てるところを、Excel も表計算ソフトも使わずに確かめる。
//
// xlsx は「XML を集めた zip」なので、壊れていても書き出しは成功してしまう。
// 壊れているかどうかは、開いた人が初めて気づく。ここで開く側をやる。
//
//   node prototype/tests/export.test.js
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync('prototype/ShiftGrid.html', 'utf8');

function grab(n) {
  const at = src.indexOf('function ' + n + '(');
  if (at < 0) throw new Error('見つからない: ' + n);
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(at, j + 1); }
  }
}
const L = t => src.split(/\r?\n/).find(l => l.includes(t));
/**
 * 目印から、その文の終わりまで。
 * 最初の ';' で切ると、括弧や文字列の中の ';' で切れる
 * （'&amp;' の ';' で切れて、読み込みが構文エラーになった）。
 */
function stmt(marker) {
  let i = src.indexOf(marker);
  if (i < 0) throw new Error('見つからない: ' + marker);
  const start = i;
  let depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === BS) i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf(NL, i); continue; }
    if (c === '/' && (src[i - 1] === '(' || src[i - 1] === ' ')) {   // 正規表現
      for (i++; i < src.length && src[i] !== '/'; i++) if (src[i] === BS) i++;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('文の終わりが見つからない: ' + marker);
}
const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);

// 書き出しは DOM に触らない（触ると Node で試せない）。ここで組み立てて確かめる
const api = new Function([
  'const DAY_COLS = 31;',
  'const WAREKI_BASE = 2018;',
  stmt('const CRC_TABLE ='),
  grab('crc32_'),
  L('  const utf8_ ='),
  grab('zipStore_'),
  stmt('const xmlEsc_ ='),
  grab('colName_'),
  stmt('const XL_FONTS ='),
  L('  const XL_W_NAME ='),
  grab('buildXlsx_'),
  'return { crc32_, zipStore_, xmlEsc_, colName_, buildXlsx_, utf8_ };',
].join('\n'))();

let fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  OK  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
};

/* ── zip を読み戻す（無圧縮なので、頭を辿るだけで開ける）── */
function unzip(bytes) {
  const b = Buffer.from(bytes);
  const out = {};
  let at = 0;
  while (b.readUInt32LE(at) === 0x04034b50) {
    const method = b.readUInt16LE(at + 8);
    assert.strictEqual(method, 0, '無圧縮で入れているはず');
    const crc = b.readUInt32LE(at + 14);
    const size = b.readUInt32LE(at + 18);
    const nlen = b.readUInt16LE(at + 26);
    const elen = b.readUInt16LE(at + 28);
    const name = b.slice(at + 30, at + 30 + nlen).toString('utf8');
    const data = b.slice(at + 30 + nlen + elen, at + 30 + nlen + elen + size);
    out[name] = { text: data.toString('utf8'), crc: crc, size: size };
    at += 30 + nlen + elen + size;
  }
  assert.ok(Object.keys(out).length, '中身が1つも読めない');
  // 中央ディレクトリと EOCD が続いているか
  assert.strictEqual(b.readUInt32LE(at), 0x02014b50, '中央ディレクトリが無い');
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'EOCD が無い');
  assert.strictEqual(b.readUInt16LE(eocd + 10), Object.keys(out).length,
    'EOCD の件数が合わない');
  assert.strictEqual(b.length, eocd + 22, 'EOCD の後ろに余分が付いている');
  return out;
}

/** XML の入れ子が閉じているか。開き括弧の数合わせでは通ってしまうので順序も見る */
function xmlWellFormed(text) {
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[3].endsWith('?') || m[2] === 'xml') continue;      // 宣言
    if (m[1]) {
      const open = stack.pop();
      assert.strictEqual(open, m[2], '閉じ方が違う: ' + open + ' を ' + m[2] + ' で閉じた');
    } else if (!m[4]) stack.push(m[2]);
  }
  assert.strictEqual(stack.length, 0, '閉じていない: ' + stack.join(','));
}

console.log('■ 部品');

ok('列名は 0→A、25→Z、26→AA、37→AL', () => {
  assert.strictEqual(api.colName_(0), 'A');
  assert.strictEqual(api.colName_(25), 'Z');
  assert.strictEqual(api.colName_(26), 'AA');
  assert.strictEqual(api.colName_(37), 'AL');   // 氏名1 + 日付31 + 集計6
});

ok('CRC32 は規格の検査値と合う', () => {
  // "123456789" の CRC32 は 0xCBF43926（どの実装でもこの値になる）
  assert.strictEqual(api.crc32_(api.utf8_('123456789')), 0xCBF43926);
  assert.strictEqual(api.crc32_(new Uint8Array(0)), 0);
});

ok('XML の特殊文字を逃がす', () => {
  assert.strictEqual(api.xmlEsc_('a&b<c>d"e'), 'a&amp;b&lt;c&gt;d&quot;e');
  assert.strictEqual(api.xmlEsc_(null), '');
  assert.strictEqual(api.xmlEsc_(0), '0');      // 0 を空にしない
});

ok('zip に入れたものが、そのまま読み戻せる', () => {
  const files = [
    { name: 'a.xml', data: api.utf8_('<x/>') },
    { name: 'dir/b.txt', data: api.utf8_('日本語も入る') },
  ];
  const got = unzip(api.zipStore_(files));
  assert.deepStrictEqual(Object.keys(got), ['a.xml', 'dir/b.txt']);
  assert.strictEqual(got['a.xml'].text, '<x/>');
  assert.strictEqual(got['dir/b.txt'].text, '日本語も入る');
  assert.strictEqual(got['a.xml'].crc, api.crc32_(files[0].data), 'CRC が合わない');
});

ok('同じ中身なら同じバイト列になる（日時を固定してある）', () => {
  const mk = () => api.zipStore_([{ name: 'a', data: api.utf8_('x') }]);
  assert.deepStrictEqual(Array.from(mk()), Array.from(mk()));
});

/* ── 表そのもの ───────────────────────────────────────── */

// 画面から読んだ格子の代わり。sheetModel_ が返す形をそのまま作る
const cell = (v, o) => Object.assign({ v: v, num: false, bg: null, name: false, span: 1 }, o);
const MODEL = {
  title: 'R8.8月',
  quota: '土日公休10回　祝日1回　休みのトータル11回',
  store: 'さくら薬局北口店',
  legend: ['○早番　10:00〜19:00'],
  marks: [{ color: '#a9d18e', label: '薬品発注担当' }],
  memo: ['【休憩について】13時〜14時'],
  cols: 38,
  year: 2026, month: 8,
  rows: [
    { kind: 'date', cells: [cell('医師名', { name: true }), cell('1', { bg: '#b8c6da' }), cell('2')] },
    { kind: 'dow', cells: [cell('', { name: true }), cell('土', { bg: '#b8c6da' }), cell('日')] },
    { kind: 'band', cells: [cell('薬剤師', { name: true, span: 3 }), null, null] },
    { kind: 'body', cells: [cell('薬剤師 1', { name: true }), cell('公休'), cell('○', { bg: '#a9d18e' })] },
    { kind: 'agg', cells: [cell('過不足', { name: true }), cell('-2', { num: true }), cell('0', { num: true })] },
  ],
};

console.log('■ できあがった .xlsx');

const book = unzip(api.buildXlsx_(MODEL));
const sheet = book['xl/worksheets/sheet1.xml'].text;
const styles = book['xl/styles.xml'].text;

ok('Excel が要求する部品が揃っている', () => {
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
   'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']
    .forEach(n => assert.ok(book[n], '足りない: ' + n));
});

ok('どの XML も閉じている', () => {
  Object.keys(book).forEach(n => {
    try { xmlWellFormed(book[n].text); }
    catch (e) { throw new Error(n + ': ' + e.message); }
  });
});

ok('文字列は inlineStr、集計は数値で入る', () => {
  assert.ok(/<c r="A1"[^>]*t="inlineStr"><is><t[^>]*>R8\.8月</.test(sheet), '表題が無い');
  // 数値を文字列で入れると、Excel で合計が取れない
  assert.ok(/<c r="B7"[^>]*><v>-2<\/v><\/c>/.test(sheet), '過不足が数値で入っていない');
  assert.ok(!/t="inlineStr"><is><t[^>]*>-2</.test(sheet), '数値が文字列になっている');
});

ok('表題・公休告知・店名・帯を結合している', () => {
  ['A1:C1', 'D1:F1', 'G1:J1'].forEach(r =>
    assert.ok(sheet.includes('ref="' + r + '"'), '結合が無い: ' + r));
  assert.ok(sheet.includes('ref="A5:AL5"'), '帯を右端まで結合していない');
});

ok('印刷設定は実物の計測どおり（§6）', () => {
  assert.ok(/orientation="landscape"/.test(sheet), '横向きでない');
  assert.ok(/paperSize="9"/.test(sheet), 'A4 でない');
  assert.ok(/scale="61"/.test(sheet), '倍率が 61% でない');
  assert.ok(/right="0"/.test(sheet), '右余白が 0 でない');
});

ok('列幅は実物の計測どおり（§1）', () => {
  assert.ok(sheet.includes('min="1" max="1" width="12.4"'), '氏名列');
  assert.ok(sheet.includes('min="2" max="32" width="5.5"'), '日付列');
  assert.ok(sheet.includes('min="33" max="38" width="6.6"'), '集計列');
});

ok('画面で付いていた色が、そのまま塗りになる', () => {
  ['FFB8C6DA', 'FFA9D18E'].forEach(c =>
    assert.ok(styles.includes('rgb="' + c + '"'), '色が落ちている: ' + c));
  // 0番と1番は Excel の予約席。ここを使うと塗りがずれる
  assert.ok(/<fills count="\d+"><fill><patternFill patternType="none"\/><\/fill>/
    .test(styles), 'fill 0 が none でない');
  assert.ok(styles.includes('patternType="gray125"'), 'fill 1 が gray125 でない');
});

ok('日付行は Arial、曜日行は ＭＳ Ｐゴシック（§3）', () => {
  assert.ok(styles.includes('<name val="Arial"/>'), 'Arial が無い');
  assert.ok(styles.includes('<name val="ＭＳ Ｐゴシック"/>'), 'ＭＳ Ｐゴシックが無い');
  assert.ok(styles.includes('<sz val="28"/>'), '表題 28pt が無い');
});

ok('すべてのセルが中央揃え（§3。氏名列も中央）', () => {
  const xfs = styles.slice(styles.indexOf('<cellXfs'), styles.indexOf('</cellXfs>'));
  const centers = (xfs.match(/horizontal="center"/g) || []).length;
  const lefts = (xfs.match(/horizontal="left"/g) || []).length;
  assert.ok(centers > lefts, '中央揃えが主でない');
  assert.ok(lefts > 0, '凡例・注記まで中央にしている（長文は左揃え）');
});

ok('色の凡例は、色だけのセルと文で出す（§4）', () => {
  // 「緑＝薬品発注担当」と文字で書いても、配られた人には照合できない
  const rows = sheet.match(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g) || [];
  const swatch = rows.find(r => /r="A\d+" s="\d+"\/>/.test(r) && /薬品発注担当/.test(r));
  assert.ok(swatch, '見本セルと説明が同じ行に無い');
});

ok('シート名は和暦（ゼロ詰めしない。表題と同じ形）', () => {
  assert.ok(book['xl/workbook.xml'].text.includes('name="R8.8月"'),
    'シート名が R8.8月 でない');
});

console.log('■ 壊れた入力で落ちない');

ok('空の表でも .xlsx として成り立つ', () => {
  const empty = Object.assign({}, MODEL, { rows: [], legend: [], marks: [], memo: [] });
  const b = unzip(api.buildXlsx_(empty));
  xmlWellFormed(b['xl/worksheets/sheet1.xml'].text);
});

ok('記号や氏名に & < > が入っても壊れない', () => {
  const nasty = Object.assign({}, MODEL, {
    title: 'A&B<C>', store: '"店"',
    rows: [{ kind: 'body', cells: [cell('山田 <太郎>', { name: true }), cell('&')] }],
  });
  const b = unzip(api.buildXlsx_(nasty));
  const x = b['xl/worksheets/sheet1.xml'].text;
  xmlWellFormed(x);
  assert.ok(x.includes('A&amp;B&lt;C&gt;'), '表題が逃がされていない');
  assert.ok(x.includes('山田 &lt;太郎&gt;'), '氏名が逃がされていない');
});

console.log('■ 配線');

ok('出力ボタンが2つあり、それぞれに繋がっている', () => {
  assert.ok(/id="outPdf"/.test(src) && /id="outXlsx"/.test(src), 'ボタンが無い');
  assert.ok(/\$\('outPdf'\)\.addEventListener\('click', exportPdf\)/.test(src),
    'PDF が繋がっていない');
  assert.ok(/\$\('outXlsx'\)\.addEventListener\('click', exportSheet\)/.test(src),
    'スプレッドシートが繋がっていない');
});

ok('スプレッドシートを先に試し、繋がっていなければ .xlsx で保存する', () => {
  const f = grab('exportSheet');
  assert.ok(/onServer\(\)/.test(f), 'Web アプリかどうかを見ていない');
  assert.ok(/apiExportToSheet\(model\)/.test(f), 'サーバを呼んでいない');
  assert.ok(/withFailureHandler/.test(f), '失敗を黙って捨てている');
  assert.ok(/exportXlsx_\(model\)/.test(f), '単体で開いたときの控えが無い');
  // 表は1回だけ読む。サーバ用と控え用で2回読むと、途中の編集で食い違う
  assert.strictEqual((f.match(/sheetModel_\(\)/g) || []).length, 1,
    '表を2回読んでいる');
});

ok('保存名は PDF も Excel も同じ規則から作る', () => {
  const pdf = grab('exportPdf'), xlsx = grab('exportXlsx_');
  assert.ok(/exportFileName_\(y, m\)/.test(pdf), 'PDF が規則を使っていない');
  assert.ok(/exportFileName_\(y, m, 'xlsx'\)/.test(xlsx), 'Excel が規則を使っていない');
  // 刷ったあとに題を戻さないと、次に保存する名前まで変わる
  assert.ok(/afterprint/.test(pdf) && /document\.title = keep/.test(pdf),
    '印刷後に題を戻していない');
});

ok('色は「刷るときの色」で読む', () => {
  const model = grab('sheetModel_');
  assert.ok(/printMetrics_\(true\)/.test(model) && /printMetrics_\(false\)/.test(model),
    '画面の色をそのまま写している（PDF と Excel で色が食い違う）');
  assert.ok(/finally/.test(model), '途中で落ちると画面が印刷の見た目のまま残る');
});

ok('店舗色や暗い画面を紙に持ち込まない', () => {
  // 店舗色は :root のインライン style に入る。!important でないと勝てず、
  // 暗いを選んだまま刷ると黒地に黒文字の紙が出る
  const print = src.slice(src.indexOf('@media print'));
  const root = print.slice(print.indexOf(':root {'), print.indexOf('}', print.indexOf(':root {')));
  ['--ground', '--band', '--ink', '--na'].forEach(k =>
    assert.ok(new RegExp(k + ':[^;]*!important').test(root), k + ' が !important でない'));
});

console.log(fail ? '\n★ NG ' + fail + ' 件' : '\n書き出し: すべて意図どおり');
process.exit(fail ? 1 : 0);
