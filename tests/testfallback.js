const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  // group_members が「存在しない」Supabaseを再現する
  await ctx.addInitScript(() => {
    const K='__fb3';
    const load=()=>{ try{ return JSON.parse(sessionStorage.getItem(K))||{events:{},answers:[],groups:{}}; }catch(e){ return {events:{},answers:[],groups:{}}; } };
    const s=load(); window.__s=s;
    const save=()=>{ try{ sessionStorage.setItem(K, JSON.stringify(s)); }catch(e){} };
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        if(this.t==='group_members') return {data:null,error:{message:'relation "group_members" does not exist',code:'42P01'}};
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);save();return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));save();return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);save();return{data:null,error:null};}
        if(this._in)return{data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });
  await p.goto(TARGET); await p.waitForTimeout(800);
  await p.fill('#ngName','SQL未実行のグループ'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(1000);
  const gid = await p.evaluate(()=>state.gid);
  console.log('① 作成:', await p.evaluate(()=>({view:state.view, ms:state.gmembers})));
  for (const n of ['りくと','あおい']) {
    const add=p.locator('button:has-text("別の人を追加する")');
    if (await add.count()) { await add.first().click(); await p.waitForTimeout(200); }
    await p.fill('#gJoin',n); await p.click('button.b:has-text("参加する")'); await p.waitForTimeout(900);
    console.log('  join', n, await p.evaluate(()=>({row:(window.__s.groups[state.gid]||{}).members, saved:(sessionStorage.getItem('__fb3')||'').match(/"members":\[[^\]]*\]/)?.[0]})));
  }
  console.log('② 参加後:', await p.evaluate(()=>state.gmembers));
  // console.log('  保存されている中身:', await p.evaluate(()=>(sessionStorage.getItem('__fb3')||'なし').slice(0,300)));
  // サーバから読み直しても3人そろっているか（ページを開き直したのと同じこと）
  const r3 = await p.evaluate(async ()=>{ state.gmembers=[]; await pullGroup();
    return { ms:state.gmembers, row:(window.__s.groups[state.gid]||{}).members }; });
  console.log('③ 読み直し:', r3, r3.ms.length===3 ? '○ OK' : '× 欠けている');
  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
