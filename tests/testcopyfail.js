const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// コピーが実は失敗していても「コピーしました」と表示していた。
// LINEのアプリ内ブラウザなど execCommand('copy') も navigator.clipboard も
// 効かない環境では、招待URLが実際にはコピーされないまま「できました」と出て、
// 招待そのものが誰にも届かない。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(800);

  // copyText() はDOM操作だけの純粋な関数なので、グループ作成などの前段は不要。

  // ① execCommand も clipboard.writeText も両方失敗する環境（LINEのWebViewを想定）
  await p.evaluate(()=>{
    document.execCommand = ()=>false;
    Object.defineProperty(navigator, 'clipboard', { value:{ writeText:()=>Promise.reject(new Error('denied')) }, configurable:true });
  });
  await p.evaluate(()=>copyText('テストURL','コピーしました。'));
  await p.waitForTimeout(200);
  const r1 = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('① 両方失敗したときの表示:', r1);

  // ② execCommandは失敗するが、clipboard.writeTextは効く環境
  await p.evaluate(()=>{
    document.execCommand = ()=>false;
    Object.defineProperty(navigator, 'clipboard', { value:{ writeText:()=>Promise.resolve() }, configurable:true });
  });
  await p.evaluate(()=>copyText('テストURL','コピーしました。'));
  await p.waitForTimeout(200);
  const r2 = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('② clipboard.writeTextだけ効くときの表示:', r2);

  // ③ execCommandが効く、いつも通りの環境
  await p.evaluate(()=>{ document.execCommand = ()=>true; });
  await p.evaluate(()=>copyText('テストURL','コピーしました。'));
  await p.waitForTimeout(200);
  const r3 = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('③ 通常どおり成功するときの表示:', r3);

  const ok = !r1.includes('コピーしました') && r1.includes('できませんでした') &&
             r2.includes('コピーしました') && r3.includes('コピーしました');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（失敗しているのに成功表示のまま）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
