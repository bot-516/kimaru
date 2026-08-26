const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1400}});
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load|createClient/.test(m.text()))errs.push('CONSOLE: '+m.text());});

  await ctx.addInitScript(() => {
    const K='__fbrep';
    const load=()=>{ try{ return JSON.parse(sessionStorage.getItem(K))||{events:{},answers:[],groups:{},gm:[]}; }catch(e){ return {events:{},answers:[],groups:{},gm:[]}; } };
    const s=load(); s.gm ||= []; window.__s=s;
    const save=()=>{ try{ sessionStorage.setItem(K, JSON.stringify(s)); }catch(e){} };
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        if(this.t==='group_members'){
          if(this._o==='p'){ const r=this._r;
            if(!s.gm.some(x=>x.group_id===r.group_id&&x.member===r.member))
              s.gm.push({group_id:r.group_id,member:r.member,joined_at:String(1e6+s.gm.length)});
            save(); return {data:null,error:null}; }
          return {data:s.gm.filter(x=>x.group_id===this.f.group_id),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);save();return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));save();return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:c(Object.values(T).filter(r=>r.group_id===this.f.group_id)),error:null};
          const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);save();return{data:null,error:null};}
        if(this._in)return{data:c(s.answers.filter(a=>this._in[1].includes(a.event_id))),error:null};
        return{data:c(s.answers.filter(a=>a.event_id===this.f.event_id)),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  const base=TARGET;
  await p.goto(base); await p.waitForTimeout(900);

  // ---------- 準備：2人のグループ＋日程1件 ----------
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(900);
  const gid = await p.evaluate(()=>state.gid);
  await p.click('button:has-text("別の人を追加する")'); await p.waitForTimeout(200);
  await p.fill('#gJoin','りくと'); await p.click('button.b:has-text("参加する")'); await p.waitForTimeout(700);
  await p.click('button.who:has-text("けんじ")'); await p.waitForTimeout(300);
  const cells = await p.$$('.gcal .cell.addable');
  for (let i=0;i<2;i++) { const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(150); }
  await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(600);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(900);
  const eid = await p.evaluate(()=>eventId);
  console.log('準備:', await p.evaluate(()=>({イベント参加者:state.members})));

  // ---------- ① 後から入った人が回答できるか ----------
  await p.goto(base+'?a=1#g='+gid); await p.waitForTimeout(1200);
  await p.click('button:has-text("別の人を追加する")'); await p.waitForTimeout(200);
  await p.fill('#gJoin','たなか'); await p.click('button.b:has-text("参加する")'); await p.waitForTimeout(800);
  console.log('① グループに追加:', await p.evaluate(()=>state.gmembers));
  console.log('   グループ画面の回答状況:', await p.evaluate(()=>{
    const t=document.body.innerText.match(/\d+\/\d+人が回答/); return t?t[0]:'（見つからず）'; }));

  await p.goto(base+'?a=2#e='+eid); await p.waitForTimeout(1500);
  await p.evaluate(()=>go('answer')); await p.waitForTimeout(400);
  const opts = await p.evaluate(()=>[...document.querySelectorAll('select option')].map(o=>o.textContent.trim()));
  console.log('② 回答者の選択肢:', opts);
  console.log('   たなかが選べるか:', opts.includes('たなか') ? '○ OK' : '× NG');
  console.log('   イベント行にも保存されたか:', await p.evaluate(()=>window.__s.events[eventId].members));

  // 実際にたなかとして回答してみる
  await p.evaluate(()=>changeMe('たなか')); await p.waitForTimeout(300);
  await p.click('text=全部 ○'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("この内容で回答する")'); await p.waitForTimeout(800);
  console.log('③ たなかの回答:', await p.evaluate(()=>({保存:!!state.answers['たなか'], 回答済み:state.members.filter(hasAnswered)})));

  // ---------- ④ 名前未選択で ○ を押したとき ----------
  await p.evaluate(()=>{ state.me=''; state.draft=null; render(); }); await p.waitForTimeout(300);
  await p.evaluate(()=>fillAll('yes')); await p.waitForTimeout(300);
  console.log('④ 名前未選択でまとめて○:', await p.evaluate(()=>{
    const t=document.querySelector('.toast'); return t?t.innerText.trim():'（無反応のまま）'; }));

  // ---------- ⑤ URLを手で書き換えたとき ----------
  await p.evaluate(g=>{ location.hash='g='+g; }, gid);
  await p.waitForTimeout(2500);
  console.log('⑤ ハッシュ書き換え:', await p.evaluate(()=>({
    画面:state.view, 眠っているイベント:eventId,
    フォーム残存:!!document.getElementById('ngName'),
    グループ名:state.gname })));

  // ---------- ⑥ 作成画面に締切バーが割り込まないか ----------
  await p.evaluate(()=>{ openNew(); });
  await p.waitForTimeout(300);
  await p.evaluate(()=>{ // 30秒タイマーが起きたのと同じことを起こす
    state.now=new Date();
    if (['new','newgroup','group'].includes(state.view)) return;
    renderStatus(); renderTopbar();
  });
  await p.waitForTimeout(200);
  console.log('⑥ 作成画面の上部:', await p.evaluate(()=>document.getElementById('topbar').innerText.replace(/\s+/g,' ').trim()));

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
