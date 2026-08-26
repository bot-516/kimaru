const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:900,height:1000}});

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  await p.goto(TARGET); await p.waitForTimeout(600);

  console.log('■ 未送信のまま離脱してもデータが消えない仕組み');
  console.log(' ', await p.evaluate(()=>{ resetAll(); state.me='けんじ'; fillAll('yes');
    return { 入力後の回答済み判定: hasAnswered('けんじ'), dirty: state.dirty,
             状況バーの見出し: (renderStatus(), document.querySelector('.status .head').textContent) }; }));

  console.log('■ アポストロフィを含む名前');
  console.log(' ', await p.evaluate(()=>{ resetAll(); mode='shared'; persist=async()=>{}; saveAnswer=async()=>true;
    state.members=[]; state.answers={}; state.me=''; state.host='';
    go('answer'); document.getElementById('joinName').value="O'Brien"; joinAsMe();
    go('cal'); toggleHostMenu(); render();
    return { メンバー: state.members, 削除ボタン: !!document.querySelector('.who .x') }; }));
  await p.waitForTimeout(300);
  console.log('  JSエラー:', errs.length?errs.join(' / '):'なし');

  await p.goto(TARGET); await p.waitForTimeout(600);
  console.log('■ 残り時間の表示');
  console.log(' ', await p.evaluate(()=>{ resetAll();
    const t=[];
    [3000, 90, 40, 20, 0].forEach(min=>{ state.deadline=new Date(state.now.getTime()+min*60000); t.push(min+'分後 → '+leftText()); });
    return t; }));

  console.log('■ 時間帯の変更');
  console.log(' ', await p.evaluate(()=>{ resetAll(); setSlot('s','19:00'); setSlot('e','21:00');
    return { slot: state.slot, 候補日の時刻: state.candidates[0].date.getHours()+':'+state.candidates[0].date.getMinutes() }; }));

  console.log('■ 確定後に状況バーと結果表示が二重にならないか');
  console.log(' ', await p.evaluate(()=>{ resetAll(); advance(48); render();
    return { 状況バー: document.querySelectorAll('#status .status').length, 結果表示: document.querySelectorAll('.decided').length }; }));

  console.log('■ 取り消しで通知の記録も巻き戻るか');
  console.log(' ', await p.evaluate(()=>{ resetAll(); const n0=state.feed.length;
    addCandidate(2026,8,31); const n1=state.feed.length; undoAdd();
    return { 追加前:n0, 追加後:n1, 取消後:state.feed.length, 候補数:state.candidates.length }; }));

  console.log('■ 主催者以外は締め切れないか');
  console.log(' ', await p.evaluate(()=>{ resetAll(); state.me='けんじ'; go('board');
    const a=document.body.innerText.includes('いま締め切って決める');
    state.me='りくと'; go('board');
    const b=document.body.innerText.includes('いま締め切って決める');
    return { 参加者として: a?'ボタンが出る(NG)':'出ない(OK)', 主催者として: b?'出る(OK)':'出ない(NG)' }; }));

  console.log('総エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
