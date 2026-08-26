// キマる — 自動測定パート（RUBRIC.md の「自動」項目）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FILE = process.argv[2] || path.resolve(__dirname, '..', 'index.html');

const lum = ([r, g, b]) => {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const parse = s => (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);

(async () => {
  const b = await chromium.launch();
  const R = { errors: [], scores: {} };
  const hook = p => {
    p.on('pageerror', e => R.errors.push('PAGEERROR: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|createClient|通信断/.test(m.text())) R.errors.push('CONSOLE: ' + m.text()); });
  };

  // ================= A1/A2 ソースコード検査 =================
  const src = fs.readFileSync(FILE, 'utf8');
  const banned = ['#4f46e5','#6366f1','#8b5cf6','#7c3aed','#a855f7','#3b82f6','#2563eb'];
  const hits = banned.filter(c => src.toLowerCase().includes(c));
  const grad = (src.replace(/repeating-linear-gradient/g,'').match(/linear-gradient|radial-gradient/g) || []).length;
  const bigRadius = (src.match(/border-radius:\s*(1[0-9]|[2-9][0-9])px/g) || []).length;
  R.A1 = { 既定色の使用: hits, 判定: hits.length === 0 ? 4 : 0 };
  // 絵文字は「実際に画面に出ているか」で見る（コード内のコメントは関係ない）

  // ================= PC =================
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } }); hook(p);

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  await p.goto('file://' + FILE); await p.waitForTimeout(700);

  // --- A2 画面に出ている絵文字 ---
  let emoji = 0;
  for (const tab of ['cal','board','answer','feed']) {
    await p.click('#tab-' + tab); await p.waitForTimeout(200);
    emoji += await p.evaluate(() => ((document.body.innerText||'').match(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/gu)||[]).length);
  }
  await p.click('#tab-cal'); await p.waitForTimeout(200);
  R.A2 = { 画面上の絵文字: emoji, グラデーション: grad, 大きな角丸: bigRadius,
           判定: (emoji === 0 ? 2 : 0) + (grad === 0 ? 1 : 0) + (bigRadius <= 2 ? 1 : 0) };

  // --- B1/B2 コントラスト比 ---
  const colors = await p.evaluate(() => {
    // 半透明の背景は下地と合成してから測る。合成しないと実際より悪い値が出る
    const rgba = c => { const n = (String(c).match(/[\d.]+/g) || []).map(Number);
      return { r:n[0]||0, g:n[1]||0, b:n[2]||0, a:n.length>3?n[3]:1 }; };
    const pick = sel => { const e = document.querySelector(sel); if (!e) return null;
      const s = getComputedStyle(e);
      const stack = []; let n = e;
      while (n) { const c = rgba(getComputedStyle(n).backgroundColor);
        if (c.a > 0) { stack.push(c); if (c.a >= 1) break; }
        n = n.parentElement; }
      let bg = { r:255, g:255, b:255 };
      for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i];
        bg = { r:c.r*c.a + bg.r*(1-c.a), g:c.g*c.a + bg.g*(1-c.a), b:c.b*c.a + bg.b*(1-c.a) }; }
      return { sel, fg:s.color, bg:`rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, size:parseFloat(s.fontSize) }; };
    return ['body','.tagline','.pitch','.note','.slabel','nav.tabs button','.topbar .now','.who','th','td','footer','.left',
            '.status .lead','.status .sub','.status .head','.cell .y','.cell.lead .y','.cell.lead .lk','.cell.past .d','.cell.dead .y','.pick','.feed .k','.quick button']
      .map(pick).filter(Boolean);
  });
  const contrast = colors.map(c => ({ ...c, r: +ratio(parse(c.fg), parse(c.bg)).toFixed(2) }));
  const body = contrast.filter(c => c.size >= 14);
  const small = contrast.filter(c => c.size < 14);
  R.B1 = { 本文: body.map(c => `${c.sel} ${c.r}`), 最小: Math.min(...body.map(c => c.r)).toFixed(2),
           判定: Math.min(...body.map(c => c.r)) >= 4.5 ? 4 : Math.min(...body.map(c => c.r)) >= 4.0 ? 2 : 0 };
  R.B2 = { 小さい文字: small.map(c => `${c.sel} ${c.r}`), 最小: (small.length ? Math.min(...small.map(c => c.r)) : 99).toFixed(2),
           判定: (small.length ? Math.min(...small.map(c => c.r)) : 99) >= 4.5 ? 3 : (small.length ? Math.min(...small.map(c => c.r)) : 99) >= 3 ? 2 : 0 };

  // --- B4 最重要情報がファーストビューに入るか ---
  R.B4 = await p.evaluate(() => {
    const vh = window.innerHeight;
    const g = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
    const status = g('.status');
    return { ステータス行の位置: status, カレンダー上端: g('.grid'), ビュー高さ: vh,
             状況が折り返し前に見える: status !== null && status < vh };
  });
  R.B4.判定 = R.B4.状況が折り返し前に見える ? 4 : 0;

  // --- C1 初回の人が回答を終えるまでのクリック数 ---
  const clicks = await p.evaluate(async () => {
    // 共有モードの新規イベント（誰もいない状態）を模擬
    mode = 'shared'; persist = async () => {}; saveAnswer = async () => true;
    state.members = []; state.answers = {}; state.me = ''; state.host = '';
    state.confirmed = null; state.failed = false; go('cal');
    let n = 0;
    go('answer'); n++;                                    // 1) 回答タブ
    document.getElementById('joinName').value = 'テスト';
    await joinAsMe(); n++;                                // 2) 参加する
    fillAll('yes'); n++;                                  // 3) 全部○
    await submitAnswer(); n++;                            // 4) 回答する
    return { クリック数: n, 完了: answered().includes('テスト') };
  });
  R.C1 = { ...clicks, 判定: clicks.完了 && clicks.クリック数 <= 5 ? 5 : clicks.完了 ? 3 : 0 };
  await p.goto('file://' + FILE); await p.waitForTimeout(600);   // mode を demo に戻す

  // ================= スマホ =================
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); hook(m);

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await m.route('**cdn.jsdelivr.net**', r => r.abort());
  await m.goto('file://' + FILE); await m.waitForTimeout(700);

  // --- C2 タップ領域 ---
  const taps = [];
  for (const tab of ['cal', 'board', 'answer', 'feed']) {
    await m.click('#tab-' + tab); await m.waitForTimeout(250);
    const t = await m.evaluate(() => [...document.querySelectorAll('button, select, input, a')]
      .filter(e => e.offsetParent !== null && !e.disabled)
      .map(e => { const r = e.getBoundingClientRect();
        return { t: (e.textContent || e.tagName).trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(x => x.h > 0 && x.h < 40));
    taps.push(...t);
  }
  const uniq = [...new Map(taps.map(t => [t.t + t.h, t])).values()];
  R.C2 = { 小さい要素: uniq, 判定: uniq.length === 0 ? 4 : uniq.length <= 3 ? 2 : 0 };

  // --- C3 横スクロール ---
  const of = [];
  for (const tab of ['cal', 'board', 'answer', 'feed']) {
    await m.click('#tab-' + tab); await m.waitForTimeout(250);
    of.push({ tab, px: await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) });
  }
  R.C3 = { 各タブ: of, 判定: of.every(x => x.px === 0) ? 3 : 0 };

  // ================= E 堅牢性 =================
  const edge = await p.evaluate(async () => {
    const out = {};
    const run = (name, fn) => { try { fn(); out[name] = 'OK'; } catch (e) { out[name] = 'NG: ' + e.message; } };
    run('メンバー0人', () => { resetAll(); state.members = []; state.answers = {}; advance(48); });
    run('候補0件', () => { resetAll(); state.candidates = []; advance(48); go('answer'); render(); });
    run('全員×', () => { resetAll(); state.members.forEach(x => { state.answers[x] = {}; state.candidates.forEach(c => state.answers[x][c.id] = 'no'); }); advance(1);
      if (!state.failed) throw new Error('全員×なのに確定した'); });
    run('締切超過', () => { resetAll(); setDeadline('2026-08-19T10:00'); advance(1);
      if (!state.confirmed && !state.failed) throw new Error('決着しない'); });
    run('候補を後追加', () => { resetAll(); addCandidate(2026, 8, 31);
      if (unanswered().length !== state.members.length) throw new Error('未回答に戻っていない'); });
    run('全員削除', () => { resetAll(); while (state.members.length) { removeMemberAt(0); removeMemberAt(0); } render(); advance(24); });
    run('確定後の再調整', () => { resetAll(); advance(48); reopen(); if (state.confirmed) throw new Error('再調整できていない'); });
    run('取り消し線と確定の整合', () => { resetAll();
      state.members.forEach(x=>{ state.answers[x]={}; state.candidates.forEach((c,i)=>state.answers[x][c.id]= i===0?'yes':'no'); });
      state.answers['りくと']['c1']='no'; state.answers['けんじ']['c1']='no'; state.answers['ゆうき']['c1']='no';
      advance(48);
      if (state.confirmed) { const s=scoreOf(state.confirmed).score;
        if (s<=0) throw new Error('0点以下の日（取り消し線を引いた日）が確定した'); } });
    run('未送信は集計に混ざらない', () => { resetAll(); state.me='みなみ';
      const before=scoreOf('c1').score; fillAll('yes');
      if (scoreOf('c1').score!==before) throw new Error('未送信の入力が点数を動かした');
      if (hasAnswered('みなみ')) throw new Error('未送信なのに回答済みになった'); });
    run('名前を切り替えても混ざらない', () => { resetAll(); state.me='みなみ'; fillAll('yes'); changeMe('そうた');
      if (hasAnswered('みなみ')) throw new Error('切替後にみなみが回答済みになった');
      if (isDirty()) throw new Error('下書きが残っている'); });
    run('主催者以外は変更できない', () => { resetAll(); state.me='けんじ';
      const n=state.candidates.length; addCandidate(2026,8,31);
      if (state.candidates.length!==n) throw new Error('参加者が候補日を追加できた'); });
    return out;
  });
  R.E2 = { 結果: edge, 判定: Object.values(edge).every(v => v === 'OK') ? 5 : 0 };

  // --- E3 キーボード操作 ---
  await p.goto('file://' + FILE); await p.waitForTimeout(600);
  R.E3 = await p.evaluate(() => {
    const f = [...document.querySelectorAll('button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(e => e.offsetParent !== null);
    const noLabel = f.filter(e => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('title'));
    return { フォーカス可能: f.length, ラベルなし: noLabel.length };
  });
  R.E3.判定 = R.E3.ラベルなし === 0 ? 4 : R.E3.ラベルなし <= 2 ? 3 : 1;

  // --- E4 入力検証 ---
  const val = await p.evaluate(async () => {
    const o = {};
    resetAll(); go('answer'); startJoin(); render();
    const set = v => { document.getElementById('joinName').value = v; };
    const n0 = state.members.length;
    set('あ'.repeat(40)); await joinAsMe(); o.長すぎる名前 = state.members.length === n0 ? '弾いた' : '通した';
    startJoin(); render(); set('   '); await joinAsMe(); o.空白のみ = state.members.length === n0 ? '弾いた' : '通した';
    startJoin(); render(); set(' たろう '); await joinAsMe(); o.前後空白 = state.members[state.members.length - 1];
    startJoin(); render(); set('<img src=x onerror=alert(1)>'); await joinAsMe(); go('board'); render();
    o.HTMLタグ = document.querySelectorAll('#view img').length === 0 ? 'エスケープ済み' : '危険';
    return o;
  });
  R.E4 = { ...val, 判定: (val.長すぎる名前 === '弾いた' ? 1 : 0) + (val.空白のみ === '弾いた' ? 1 : 0) + (val.HTMLタグ === 'エスケープ済み' ? 1 : 0) };

  // --- E5 保存失敗時 ---
  R.E5 = await p.evaluate(async () => {
    resetAll(); mode = 'shared';
    db = { from: () => { throw new Error('通信断'); } };
    try { await persist(); await saveAnswer(); render(); return { 判定: 3, 状態: '画面は生きている' }; }
    catch (e) { return { 判定: 0, 状態: '例外が外に漏れた: ' + e.message }; }
  });

  R.E1 = { エラー: R.errors, 判定: R.errors.length === 0 ? 5 : 0 };

  await b.close();

  // ================= 集計 =================
  const auto = { A1:4, A2:4, B1:4, B2:3, B4:4, C1:5, C2:4, C3:3, E1:5, E2:5, E3:4, E4:3, E5:3 };
  let got = 0, max = 0;
  console.log('=== 自動測定 ===');
  for (const k of Object.keys(auto)) {
    const s = R[k] ? R[k].判定 : 0;
    got += s; max += auto[k];
    console.log(`${k}: ${s}/${auto[k]}`, JSON.stringify(R[k], null, 0).slice(0, 300));
  }
  console.log(`\n自動項目 合計: ${got}/${max}`);
  fs.writeFileSync(path.resolve(__dirname,'audit_result.json'), JSON.stringify(R, null, 2));
})();
