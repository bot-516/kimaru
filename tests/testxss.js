const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 「前に使ったグループ」一覧の onclick="gotoGroup('${esc(g.id)}')" は、HTMLエンティティの
// デコードが onclick 属性のJSコンパイルより先に起きるため、esc() でシングルクォートを
// &#39; に変えても、細工した group id を踏まされたブラウザ側では結局そのまま ' に戻り、
// 文字列リテラルを抜けて任意のJSを実行できてしまっていた（保存型XSS）。
// group id は Supabase の公開anonキーとゆるいRLSにより、悪意ある第三者が groups テーブルへ
// 直接insertして自由に決められる（HANDOFF.md 3章に明記されている既知の弱いRLS）。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  // 実行されると window.__xss=true になる、JS文字列を抜け出すペイロードを id に仕込む
  const payload = "x');window.__xss=true;//";

  await p.goto(TARGET); await p.waitForTimeout(500);
  await p.evaluate((id)=>{
    localStorage.setItem('kimaru.groups', JSON.stringify([{id, name:'罠', at:Date.now()}]));
    window.__xss=false;
    // 本物のネットワーク呼び出しをせず、渡された引数だけを見る
    window.gotoGroup = (arg)=>{ window.__calledWith=arg; };
  }, payload);

  // 入口画面を作り直させて「前に使ったグループ」を再描画させる
  await p.evaluate(()=>{ openNewGroup(); });
  await p.waitForTimeout(200);

  await p.click('.evlist .ev');
  await p.waitForTimeout(200);

  const r = await p.evaluate(()=>({ xss実行:window.__xss, 渡された引数:window.__calledWith }));
  console.log('結果:', r);

  const ok = r.xss実行===false && r.渡された引数===payload;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（JS文字列を抜け出せてしまう）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
