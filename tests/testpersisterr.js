const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// persist() は db.from('events').update(...) の結果を待つだけで、その { error } を見ていない。
// supabase-js は失敗しても例外を投げないことがある（RLS拒否・制約違反・5xx等）。
// その場合、書き込みが失敗したのに lastRow は「書けた」ことになってしまい、
// 次に持ち直しても差分が無いと判定されて、二度と再送されない。
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
        // 例外は投げない。PostgRESTの実際の失敗はこう返ってくる。
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

  // グループを作り、候補日2つでイベントを作る
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);
  for (let i=0;i<2;i++){ const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(120); }
  await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(400);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);

  const id = await p.evaluate(()=>eventId);
  const before = await p.evaluate((id)=>window.__s.events[id].deadline, id);

  // 締切だけを変更 → 保存が「例外なしのerror」で失敗する
  await p.evaluate(()=>{ window.__updateFail=true; });
  await p.evaluate(()=>{ state.deadline=new Date(Date.now()+9*3600000); persist(); });
  await p.waitForTimeout(500);
  const afterFail = await p.evaluate((id)=>window.__s.events[id].deadline, id);
  const toastFail = await p.evaluate(()=>(document.querySelector('.toast')||{}).innerText||'（なし）');
  console.log('① 保存がerrorで失敗:', { DBの締切は変わっていないか: afterFail===before, 失敗を伝える表示: toastFail });

  // 通信が回復。もう一度は明示的に呼ばず、別の操作で persist() が再度走ったときに
  // 前回失敗した分（締切）も一緒に送られるか＝再送されるかを見る
  await p.evaluate(()=>{ window.__updateFail=false; });
  await p.evaluate(()=>{ state.memo='会議室B'; persist(); });
  await p.waitForTimeout(500);
  const afterRecover = await p.evaluate((id)=>window.__s.events[id], id);
  console.log('② 回復後、別の変更のついでに前回分も再送されたか:', {
    締切が反映されたか: afterRecover.deadline !== before,
    メモも反映されたか: afterRecover.memo==='会議室B' });

  const ok = afterFail===before && toastFail.includes('保存に失敗') &&
             afterRecover.deadline !== before && afterRecover.memo==='会議室B';

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（失敗した書き込みが再送されない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
