const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 作成者が1人だけの状態で自分の回答を全部済ませても、状況バーはずっと
// 「つぎにやること／このURLをグループに送る」のままで、「このままだと〈日付〉に
// 決まります」という、このアプリの核心となる予告表示が永遠に出てこなかった。
// renderStatus() の分岐条件だけを見たいので、submitAnswer()/tick() は経由せず
// （デモモードは全員回答済みで即確定する別機能を持っており、それと混ざってしまうため）
// state を直接組み立てて render() する。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();
  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに繋ぎにいってしまう。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(500);

  // ① 参加者は自分1人だけ、まだ回答していない状態
  await p.evaluate(()=>{
    state.members=['りくと']; state.me='りくと'; state.host='りくと';
    state.candidates.forEach(c=>c.date=new Date(state.now.getTime()+2*3600000));
    state.deadline=new Date(state.now.getTime()+3600000);
    state.answers={}; state.confirmed=null; state.failed=false; state.draft=null;
    state.view='cal'; render();
  });
  const before = await p.evaluate(()=>document.querySelector('.status .head')?.textContent||'');
  console.log('① 回答前の状況バー:', before);

  // ② 同じ状態のまま、自分の回答だけを全部埋める（submitAnswer()は経由しない）
  await p.evaluate(()=>{
    const a={}; state.candidates.forEach(c=>a[c.id]='yes');
    state.answers={'りくと':a}; state.draft=null;
    render();
  });
  const after = await p.evaluate(()=>({
    見出し: document.querySelector('.status .head')?.textContent||'',
    本文: document.querySelector('.status')?.textContent||'' }));
  console.log('② 全部回答したあとの状況バー:', after);

  const ok = before.includes('URLをグループに送る') &&
             after.見出し.includes('決まります') && !after.見出し.includes('URLをグループに送る');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（自分1人で回答しても予告が出ない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
