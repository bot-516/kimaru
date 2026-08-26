const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 違う文面の2つのコピーボタンをほぼ同時に押すと、非同期処理の解決順序次第で
// 先に押した方の結果が後から届き、あとに押した方（＝実際に画面に表示されている
// はずの結果）のトーストを上書きしてしまうことがあった。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(800);

  await p.evaluate(()=>{
    let n=0;
    // 1回目（A）はexecCommandが失敗してclipboard.writeTextの非同期フォールバックへ、
    // 2回目（B）はexecCommandがその場で成功する、という状況を再現する。
    document.execCommand = ()=>{ n++; return n>1; };
    Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{
      writeText: ()=> new Promise(res=>{ window.__resolveA = res; }) } });
  });

  // A（あとから解決する）を先に押す
  await p.evaluate(()=>copyText('文面A','Aをコピーしました。'));
  // B（その場で解決する）をすぐ押す
  await p.evaluate(()=>copyText('文面B','Bをコピーしました。'));
  await p.waitForTimeout(100);
  const r1 = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('① Bを押した直後の表示:', r1);

  // Aの非同期処理がここでようやく解決する（Bより後に完了する）
  await p.evaluate(()=>window.__resolveA());
  await p.waitForTimeout(100);
  const r2 = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('② Aが遅れて解決したあとの表示（Bのままであるべき）:', r2);

  const ok = r1.includes('Bをコピーしました') && r2.includes('Bをコピーしました') && !r2.includes('Aをコピーしました');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（古いコピー結果が新しい結果を上書きしている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
