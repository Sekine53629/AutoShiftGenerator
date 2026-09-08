// 送られてくる「◯年◯月医師シフト.xlsx」を読むところを確かめる。
//
// ブックの中身は毎月まるごと入れ替わるので、位置の決め打ちをすると
// 翌月に壊れる。実物には**間違った日付**や**前月の暦の残り**も入っていた。
// そこに引きずられないことを見る。
//
//   node prototype/tests/intake.test.js
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

const api = new Function([
  stmt('  const XL_DAY_MIN'),
  grab('xlDate_'), grab('refOf_'), grab('colName_'),
  stmt('  const nameInFormula_ ='),
  stmt('  const normName_ ='),
  L('  const DOW_SET ='),
  'return { xlDate_, refOf_, colName_, nameInFormula_, normName_, DOW_SET };',
].join('\n'))();

let fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log('  OK  ' + name); }
  catch (e) { fail++; console.log('  NG  ' + name + '\n      ' + e.message); }
};

console.log('■ 日付の読み取り');

ok('Excel の通し番号を日付にする', () => {
  // 基準は 1899-12-30。1900年うるう年の扱いを間違えると1日ずれる
  assert.deepStrictEqual(api.xlDate_(46296), { y: 2026, m: 10, d: 1 });
  assert.deepStrictEqual(api.xlDate_(46299), { y: 2026, m: 10, d: 4 });
  assert.deepStrictEqual(api.xlDate_(46326), { y: 2026, m: 10, d: 31 });
  assert.deepStrictEqual(api.xlDate_(45658), { y: 2025, m: 1, d: 1 });
});

ok('小数（時刻つき）でも日にちは変わらない', () => {
  assert.deepStrictEqual(api.xlDate_(46296.75), { y: 2026, m: 10, d: 1 });
});

ok('セル番地を読む', () => {
  assert.deepStrictEqual(api.refOf_('A1'), { col: 1, row: 1 });
  assert.deepStrictEqual(api.refOf_('G13'), { col: 7, row: 13 });
  assert.deepStrictEqual(api.refOf_('AA100'), { col: 27, row: 100 });
  assert.strictEqual(api.refOf_('こわれ'), null);
});

ok('番地と列名が行き来できる', () => {
  for (let i = 1; i <= 60; i++) {
    assert.strictEqual(api.refOf_(api.colName_(i - 1) + '1').col, i);
  }
});

console.log('■ 式に埋まった名前');

// 実物は `=IF(A5="","","山田 太郎")` の形。「この列に日付があればこの医師が出る」
ok('式の中の名前を取り出す', () => {
  assert.strictEqual(api.nameInFormula_('IF(A5="","","山田 太郎")'), '山田 太郎');
  assert.strictEqual(api.nameInFormula_('IF($B$13="","","佐藤 花子")'), '佐藤 花子');
  assert.strictEqual(api.nameInFormula_(' IF(A5="", "", "空白あり") '), '空白あり');
});

ok('関係ない式からは取らない', () => {
  ['SUM(A1:A5)', 'IF(A5="","",A6)', 'A1', '', null, undefined]
    .forEach(f => assert.strictEqual(api.nameInFormula_(f), '', String(f)));
});

ok('名前が空の式は空を返す（その日は出ない医師）', () => {
  assert.strictEqual(api.nameInFormula_('IF(A5="","","")'), '');
});

console.log('■ 名前の突き合わせ');

ok('空白と全角半角をならして照合する', () => {
  const same = (a, b) => assert.strictEqual(api.normName_(a), api.normName_(b), a + ' / ' + b);
  same('山田 太郎', '山田太郎');
  same('山田　太郎', '山田太郎');       // 全角空白
  same('ＡＢＣ', 'abc');                 // 全角英字
  assert.notStrictEqual(api.normName_('山田太郎'), api.normName_('山本太郎'));
});

console.log('■ ブックの読み方（作りの約束）');

// ここから下は、実物で踏んだ落とし穴が塞がっているかを見る。
// どれも「翌月のファイルで静かに壊れる」たぐいのもの
{
  const f = grab('readDoctorBook_');

  ok('曜日の見出し行を目印にする（行番号を決め打ちしない）', () => {
    assert.ok(/DOW_SET\.indexOf/.test(f), '曜日を探していない');
    assert.ok(/>= 5/.test(f), '5つ以上そろう行、という条件が無い');
  });

  ok('いちばん上の暦だけを読む', () => {
    // 実物には下のほうに別の月の暦が残っていた。全部読むと、日にちだけで
    // 突き合わせるので下の月が上の月を上書きする（4日が3人→5人になった）
    assert.ok(/heads\[0\]/.test(f), '先頭の暦を選んでいない');
    assert.ok(/blockEnd/.test(f), '次の暦の手前で切っていない');
  });

  ok('A1・A2 を見ない', () => {
    // 実物の A1 には前の月の日付が残っていた。どの式からも参照されていない
    // 番地を名指しして読んでいないこと（注記に A1 と書くのは構わない）
    assert.ok(!/cells\[\s*['"][A-Z]+\d/.test(f),
      'セルを番地で名指しして読んでいる');
    assert.ok(/p2\.row <= headRow/.test(f), '見出しより上を外していない');
  });

  ok('年月は日付そのものから決める', () => {
    assert.ok(/tally\[k\]/.test(f) && /sort/.test(f), '多数決で決めていない');
  });

  ok('式を先に見る（計算されていないブックでも読める）', () => {
    assert.ok(/nameInFormula_\(cell\.f\) \|\| cell\.v/.test(f),
      '計算済みの値だけを見ている');
  });

  ok('曜日や数字を名前として拾わない', () => {
    assert.ok(/DOW_SET\.indexOf\(name\)/.test(f), '曜日を弾いていない');
  });
}

{
  const f = grab('applyDoctorBook_');

  ok('その月の医師名欄を消してから入れる', () => {
    // 足すだけだと、医師が減った日に前の名前が残る
    assert.ok(/values\.delete\(k\)/.test(f), '消していない');
    assert.ok(/doc/.test(f) && /q\[1\] === curYm/.test(f),
      '医師の行・その月だけを狙っていない');
  });

  ok('スタッフのシフトには触らない', () => {
    assert.ok(!/role|staff/.test(f), 'スタッフ行を触っている');
  });

  ok('取り込む前に控えを取る', () => {
    assert.ok(/snapshot_\(/.test(f), '戻せない');
  });

  ok('医師名欄の行数を超えた日を黙って捨てない', () => {
    assert.ok(/overflow/.test(f), '入りきらない日を報せていない');
  });
}

{
  const f = grab('registerDoctors_');

  ok('マスタに無い医師は、その場で登録する', () => {
    // 登録しておかないと、シフト表に入れるべき略称が決まらない
    assert.ok(/DB\.doctors\.push/.test(f), '登録していない');
    assert.ok(/added\.push/.test(f), '足した名前を持ち帰っていない');
  });

  ok('登録したことを黙らない', () => {
    // 氏名を勝手に増やしたように見えないよう、足した名前を並べて出す
    const imp = grab('importDoctorFile');
    assert.ok(/新しく登録しました/.test(imp), '知らせていない');
    assert.ok(/r\.added\.join/.test(imp), '名前を並べていない');
  });

  ok('略称の作り方は共通の道具に任せる', () => {
    assert.ok(/shortNameOf_\(name, used\)/.test(f), '共通の道具を使っていない');
  });
}

{
  // 同じ姓の人がいると、姓だけでは見分けられない。
  // 括弧は半角。全角にすると2文字ぶんの幅を取り、26px の列に収まらない
  const mk = new Function(
    grab('surnameOf_') + grab('shortNameOf_') + ' return shortNameOf_;')();

  ok('かぶらなければ姓だけ', () => {
    assert.strictEqual(mk('秋山 貴由', new Set()), '秋山');
  });

  ok('姓がかぶったら 姓(名の1文字目)', () => {
    assert.strictEqual(mk('西本 紀之', new Set(['西本'])), '西本(紀)');
    assert.strictEqual(mk('佐藤 健太', new Set(['佐藤'])), '佐藤(健)');
  });

  ok('括弧は半角（全角だと列に収まらない）', () => {
    const t = mk('西本 紀之', new Set(['西本']));
    assert.ok(t.indexOf('(') >= 0 && t.indexOf('（') < 0, '全角の括弧を使っている: ' + t);
  });

  ok('それでもかぶるときだけ数字を足す', () => {
    assert.strictEqual(mk('西本 紀之', new Set(['西本', '西本(紀)'])), '西本(紀)2');
    // 名が無い（区切りの無い）名前は、姓に数字
    assert.strictEqual(mk('西本', new Set(['西本'])), '西本2');
  });

  ok('マスタごとに見る（社員と医師で同じ姓がいても構わない）', () => {
    const taken = new Function(grab('surnameOf_') + grab('takenShorts_')
      + ' return takenShorts_;')();
    const list = [{ name: '秋山 貴由', short: '秋山' }, { name: '西本 紀之', short: '' }];
    const set = taken(list, null);
    assert.ok(set.has('秋山') && set.has('西本'), '略称が空の行を見ていない');
    // 自分の行は外す。編集中に自分とかぶったことにならないよう
    assert.ok(!taken(list, list[0]).has('秋山'), '自分の行を外していない');
  });
}

{
  // シフト表の医師欄は26pxしかない。フルネームは入らない（実測5文字＝34px）
  const api2 = new Function(grab('surnameOf_') + ' return surnameOf_;')();

  ok('姓を取り出す', () => {
    assert.strictEqual(api2('秋山 貴由'), '秋山');
    assert.strictEqual(api2('秋山　貴由'), '秋山');      // 全角空白
    assert.strictEqual(api2('  西本 紀之  '), '西本');
  });

  ok('区切りが無ければ、そのまま短く切る', () => {
    assert.strictEqual(api2('山田'), '山田');
    assert.strictEqual(api2('医A'), '医A');
    assert.strictEqual(api2('とてもながいなまえ'), 'とてもな');
    assert.strictEqual(api2(''), '');
  });
}

{
  ok('シフト表に入れるのは略称（姓）', () => {
    const f2 = grab('applyDoctorBook_');
    assert.ok(/short\[normName_\(raw\)\]/.test(f2), 'フルネームを入れている');
    // 入力候補も、セルに入るものに合わせる
    const dl = grab('renderDatalists');
    assert.ok(/d\.short/.test(dl), '候補がフルネームのまま');
  });
}

{
  const f = grab('unzip_');

  ok('zip はライブラリ無しで開く', () => {
    // 1ファイルで配る作りなので、外から読み込むものを増やさない
    assert.ok(/DecompressionStream/.test(f), '展開の手立てが無い');
    assert.ok(/method === 0/.test(f), '無圧縮の中身を読めない');
    assert.ok(/中央目録|0x02014b50/.test(f), '中央目録を辿っていない');
  });

  ok('ローカルヘッダの長さを読み直している', () => {
    // 中央目録とローカルヘッダで拡張領域の長さが違うことがある。
    // 中央目録の値で位置を出すと、中身がずれて読めない
    assert.ok(/lelen/.test(f), 'ローカル側の長さを見ていない');
  });

  ok('使えないブラウザでは理由を出す', () => {
    assert.ok(/Chrome か Edge/.test(f), '案内が無い');
  });
}

console.log(fail ? '\n★ NG ' + fail + ' 件' : '\n取り込み: すべて意図どおり');
process.exit(fail ? 1 : 0);
