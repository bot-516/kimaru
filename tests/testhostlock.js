const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// ホストが設定パネルから自分自身をメンバーから外すと、state.hostだけが
// 居なくなった名前のまま残り、isHost()が誰に対してもfalseになって
// 以後だれもこのイベントを変更できなくなっていた（自分でロックしてしまう）。
// state.host===''（ホスト無し）は元々「誰でも管理できる」扱いなので、そこに戻るべき。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await p.goto(TARGET); await p.waitForTimeout(800);

  const before = await p.evaluate(()=>({ host: state.host, me: state.me, isHost: isHost() }));
  console.log('① 最初の状態:', before);

  // ホスト本人（りくと＝state.me）が、設定パネルから自分自身を外す
  const after = await p.evaluate(()=>{
    const i = state.members.indexOf(state.host);
    removeMemberAt(i);   // 1回目：確認待ちにする
    removeMemberAt(i);   // 2回目：実際に外す
    return { host: state.host, me: state.me, members: state.members.slice(), isHost: isHost() };
  });
  console.log('② 自分自身を外した直後:', after);

  // ロックされていないか：外した直後でも候補日の追加など「ホスト操作」が通るか
  const acted = await p.evaluate(()=>{
    const before = state.candidates.length;
    const d = new Date(); d.setDate(d.getDate()+40);
    addCandidate(d.getFullYear(), d.getMonth()+1, d.getDate());
    return { 追加できたか: state.candidates.length===before+1,
             拒否トースト: (document.querySelector('.toast')||{}).innerText||'（なし）' };
  });
  console.log('③ 外した直後にホスト操作ができるか:', acted);

  const ok = before.host==='りくと' && !after.members.includes('りくと') &&
             after.host==='' && after.isHost===true && acted.追加できたか;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（ホスト自己削除でロックされている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
