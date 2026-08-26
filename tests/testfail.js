const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 通信が失敗したときに「できました」と嘘をつかないか／画面が壊れないかを見る
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__fail=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        if (window.__fail && this._o!=='s') throw new Error('通信できません（テスト）');
        if(this.t==='group_members'){
          if(this._o==='p'){ const r=this._r;
            if(!s.gm.some(x=>x.group_id===r.group_id&&x.member===r.member))
              s.gm.push({group_id:r.group_id,member:r.member,joined_at:String(1e6+s.gm.length)});
            return {data:null,error:null}; }
          return {data:c(s.gm.filter(x=>x.group_id===this.f.group_id)),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){ if(T[this.f.id]) { window.__patches.push(Object.keys(this._r)); Object.assign(T[this.f.id],c(this._r)); } return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:c(Object.values(T).filter(r=>r.group_id===this.f.group_id)),error:null};
          const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);return{data:null,error:null};}
        if(this._in)return{data:c(s.answers.filter(a=>this._in[1].includes(a.event_id))),error:null};
        return{data:c(s.answers.filter(a=>a.event_id===this.f.event_id)),error:null};}
      then(res,rej){ try { return Promise.resolve(this.run()).then(res,rej); } catch(e){ return Promise.reject(e).then(res,rej); } } }
    window.__patches=[];
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  const base=TARGET;
  await p.goto(base); await p.waitForTimeout(800);

  // ---- ② グループ作成が失敗 → もう一度押す ----
  await p.evaluate(()=>{ window.__fail=true; });
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(600);
  console.log('② 1回目の失敗:', await p.evaluate(()=>({
    画面:state.view, 入力が残っているか:document.getElementById('ngName')?.value ?? '（欄が消えた）',
    表示:(document.querySelector('.err')||{}).textContent||'（なし）' })));
  await p.click('button.b'); await p.waitForTimeout(600);   // ← ここで以前は落ちていた
  console.log('   2回目を押しても生きているか:', await p.evaluate(()=>({
    画面:state.view, 入力:document.getElementById('ngName')?.value ?? '（欄が消えた）' })));
  console.log('   例外:', errs.length?errs.join(' / '):'なし');

  // 通信を回復して作成
  await p.evaluate(()=>{ window.__fail=false; });
  await p.click('button.b'); await p.waitForTimeout(900);
  console.log('   回復後:', await p.evaluate(()=>({画面:state.view, メンバー:state.gmembers})));

  // ---- ① イベント作成が失敗 ----
  for (let i=0;i<2;i++){ const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(120); }
  await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(500);
  await p.fill('#ndTitle','ミーティング');
  await p.evaluate(()=>{ window.__fail=true; });
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);
  console.log('① イベント作成が失敗したとき:', await p.evaluate(()=>({
    画面:state.view,
    嘘の成功メッセージ:(document.querySelector('.toast')||{}).innerText||'（なし）',
    表示:(document.querySelector('.err')||{}).textContent||'（なし）',
    DBの件数:Object.keys(window.__s.events).length,
    入力が残っているか:document.getElementById('ndTitle')?.value ?? '（欄が消えた）' })));
  // 回復してもう一度
  await p.evaluate(()=>{ window.__fail=false; });
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(900);
  console.log('   回復後:', await p.evaluate(()=>({画面:state.view, DBの件数:Object.keys(window.__s.events).length, 候補:state.candidates.length})));

  // ---- ③ 保存は差分だけか ----
  await p.evaluate(()=>{ window.__patches=[]; });
  await p.evaluate(()=>{ state.deadline=new Date(Date.now()+3*3600000); persist(); });
  await p.waitForTimeout(500);
  console.log('③ 締切だけ変えたときに書いた項目:', await p.evaluate(()=>window.__patches));

  // ---- ⑤ 誰も答えないまま締切が来たときの文言 ----
  await p.evaluate(()=>{ state.deadline=new Date(Date.now()-1000); state.answers={}; tick(); });
  await p.waitForTimeout(300);
  console.log('⑤ 無回答で締切:', await p.evaluate(()=>state.feed.map(f=>f.msg).join(' / ')));

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
