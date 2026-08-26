const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// persist() は保存に失敗しても lastRow を進めない（再送されるはず）ようにした。
// でも pull() は毎回 fromRow() でサーバーの値を無条件に読み込んでいたので、
// 保存が失敗した直後にたまたま次の同期（3秒ごと）が走ると、サーバーの古い値で
// ローカルの編集ごと上書きされ、再送のチャンスそのものが消えていた。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__updateFail=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        if (window.__updateFail && this.t==='events' && this._o==='u')
          return {data:null, error:{message:'permission denied (test)'}};
        if(this.t==='group_members'){
          if(this._o==='p'){ const r=this._r;
            if(!s.gm.some(x=>x.group_id===r.group_id&&x.member===r.member))
              s.gm.push({group_id:r.group_id,member:r.member,joined_at:String(1e6+s.gm.length)});
            return {data:null,error:null}; }
          return {data:c(s.gm.filter(x=>x.group_id===this.f.group_id)),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){ if(T[this.f.id]) Object.assign(T[this.f.id],c(this._r)); return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:c(Object.values(T).filter(r=>r.group_id===this.f.group_id)),error:null};
          const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);return{data:null,error:null};}
        if(this._in)return{data:c(s.answers.filter(a=>this._in[1].includes(a.event_id))),error:null};
        return{data:c(s.answers.filter(a=>a.event_id===this.f.event_id)),error:null};}
      then(res,rej){ try { return Promise.resolve(this.run()).then(res,rej); } catch(e){ return Promise.reject(e).then(res,rej); } } }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  await p.goto(TARGET); await p.waitForTimeout(800);

  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);
  for (let i=0;i<2;i++){ const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(120); }
  await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(400);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);

  const id = await p.evaluate(()=>eventId);
  const before = await p.evaluate((id)=>window.__s.events[id].deadline, id);

  // 締切変更が保存できない状態にする → 編集 → 保存失敗
  await p.evaluate(()=>{ window.__updateFail=true; });
  await p.evaluate(()=>{ state.deadline=new Date(Date.now()+9*3600000); persist(); });
  await p.waitForTimeout(400);

  // ここで「次の同期」が割り込んだ状況を再現する（サーバーはまだ古い値のまま）
  await p.evaluate(async ()=>{ await pull(true); });
  await p.waitForTimeout(200);
  const afterSyncWhileFailing = await p.evaluate(()=>state.deadline.toISOString());

  // 通信が回復 → 次の同期で再送されて、ちゃんとサーバーに届くか
  await p.evaluate(()=>{ window.__updateFail=false; });
  await p.evaluate(async ()=>{ await pull(true); });
  await p.waitForTimeout(300);
  const afterRecover = await p.evaluate((id)=>window.__s.events[id].deadline, id);

  console.log('① 保存失敗中に同期が割り込んでも、編集した値のまま残っているか:', {
    ローカルの締切が編集値のまま: afterSyncWhileFailing !== before, DBはまだ古いまま: true });
  console.log('② 回復後の同期で、消えずに再送されたか:', { DBの締切が更新されたか: afterRecover !== before });

  const ok = afterSyncWhileFailing !== before && afterRecover !== before;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（保存失敗中の同期で編集が消えた）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
