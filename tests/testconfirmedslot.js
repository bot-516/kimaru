const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// addCandidate()/removeCandidate() は「確定後は変更できない」を守っているのに、
// setSlot()（開始・終了時刻の変更）だけその確認が無く、確定した日の時刻を
// 通知もフィードも残さずに書き換えられてしまっていた。すでに「確定しました」を
// 見た人に、実際の時間が変わったことが伝わらない。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(500);
  // デモモードで、候補日を1つだけにして即確定させる
  await p.evaluate(()=>{
    state.candidates=[{id:'c1',date:new Date(state.now.getTime()+3600000)}];
    state.answers={'りくと':{c1:'yes'}};
    state.members=['りくと']; state.me='りくと'; state.host='りくと';
    state.deadline=new Date(state.now.getTime()-1000);
    state.confirmed=null; state.failed=false; state.feed=[];
    tick(); render();
  });
  const before = await p.evaluate(()=>({
    確定: state.confirmed,
    時刻: state.candidates.find(c=>c.id===state.confirmed).date.toISOString(),
    フィード件数: state.feed.length }));
  console.log('① 確定直後:', before);

  // 確定後に、host権限のまま setSlot() を叩く（設定パネルの時刻変更に相当）
  const after = await p.evaluate(()=>{
    setSlot('s','09:00');
    return { 時刻: state.candidates.find(c=>c.id===state.confirmed).date.toISOString(),
      フィード件数: state.feed.length,
      表示: (document.querySelector('.toast')||{}).innerText||'（なし）' };
  });
  console.log('② 確定後にsetSlotを呼んだ結果:', after);

  const ok = before.確定!==null && after.時刻===before.時刻 &&
             after.フィード件数===before.フィード件数 && after.表示.includes('再調整');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（確定済みの時刻が無警告で書き換わった）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
