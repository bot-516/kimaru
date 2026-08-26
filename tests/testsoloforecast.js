const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 作成者が1人だけの状態で自分の回答を全部済ませても、状況バーはずっと
// 「つぎにやること／このURLをグループに送る」のままで、「このままだと〈日付〉に
// 決まります」という、このアプリの核心となる予告表示が永遠に出てこなかった。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(500);
  // デモモードのまま、参加者を自分1人だけにする
  await p.evaluate(()=>{
    state.members=['りくと']; state.me='りくと'; state.host='りくと';
    state.answers={}; state.confirmed=null; state.failed=false; state.draft=null;
    state.deadline=new Date(Date.now()+3600000);
    state.candidates.forEach(c=>c.date=new Date(Date.now()+2*3600000));
    state.view='cal'; render();
  });

  const before = await p.evaluate(()=>document.querySelector('.status .head')?.textContent||'');
  console.log('① 回答前の状況バー:', before);

  // 全ての候補日に自分で回答して送信する
  await p.evaluate(()=>{
    state.draft={}; state.candidates.forEach(c=>state.draft[c.id]='yes');
    submitAnswer();
  });
  await p.waitForTimeout(200);

  const after = await p.evaluate(()=>({
    見出し: document.querySelector('.status .head')?.textContent||'',
    本文: document.querySelector('.status')?.textContent||'' }));
  console.log('② 全部回答したあとの状況バー:', after);

  const ok = after.見出し.includes('決まります') && !after.見出し.includes('URLをグループに送る');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（自分1人で回答しても予告が出ない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
