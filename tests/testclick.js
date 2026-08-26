const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 「同期の再描画がクリックを飲み込む」を再現・検証する。
// 押している最中に描き直しを起こして、クリックが成立するかを見る。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s;
    const save=()=>{};
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
            return {data:null,error:null}; }
          return {data:c(s.gm.filter(x=>x.group_id===this.f.group_id)),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:c(Object.values(T).filter(r=>r.group_id===this.f.group_id)),error:null};
          const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);return{data:null,error:null};}
        if(this._in)return{data:c(s.answers.filter(a=>this._in[1].includes(a.event_id))),error:null};
        return{data:c(s.answers.filter(a=>a.event_id===this.f.event_id)),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  const base=TARGET;
  await p.goto(base); await p.waitForTimeout(800);
  await p.fill('#ngName','クリック検証'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(800);
  for (let i=0;i<3;i++){ const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(120); }
  await p.click('button:has-text("この3日で決める")'); await p.waitForTimeout(500);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);
  await p.evaluate(()=>go('answer')); await p.waitForTimeout(400);

  // ---- 押し下げ中に描き直しを起こす（同期が走った瞬間と同じ状況） ----
  const btn = p.locator('.quick button:has-text("全部 ○")');
  const box = await btn.boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await p.mouse.down();
  await p.evaluate(()=>{ render(); });      // ← 指が触れている間に再描画
  await p.waitForTimeout(80);
  await p.mouse.up();
  await p.waitForTimeout(400);
  const r1 = await p.evaluate(()=>{
    const d=state.draft||{}; return {反映:state.candidates.filter(c=>d[c.id]==='yes').length+'/'+state.candidates.length};
  });
  console.log('① 押している最中に同期が走った場合:', r1, r1.反映.split('/')[0]!=='0' ? '○ OK' : '× 飲み込まれた');

  // ---- 同期が中身の変わらない再描画を繰り返しても効くか ----
  await p.evaluate(()=>{ state.draft=null; render(); }); await p.waitForTimeout(200);
  const t0 = await p.evaluate(()=>{ window.__renders=0; const o=renderBody;
    window.renderBody=function(h){ window.__renders++; return o(h); }; return true; });
  await p.waitForTimeout(6500);   // 同期2回ぶん待つ（中身は変わっていない）
  console.log('② 6.5秒放置したあいだの描き直し回数:', await p.evaluate(()=>window.__renders), '（0なら無駄な再描画なし）');

  await p.locator('.quick button:has-text("全部 △")').click();
  await p.waitForTimeout(300);
  const r2 = await p.evaluate(()=>{ const d=state.draft||{};
    return state.candidates.filter(c=>d[c.id]==='maybe').length+'/'+state.candidates.length; });
  console.log('③ 放置後の1回目のクリック:', r2, r2.split('/')[0]!=='0' ? '○ OK' : '× 効かない');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
