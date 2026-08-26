const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// pullGroup() は個々のイベントの tick()（自動確定）を回さない（サーバーが常駐していないので
// これ自体は仕様どおり：HANDOFF 4章）。しかし、グループ画面の「進行中」一覧は締切を過ぎた
// イベントをずっと「あと0時間」と表示し続けていて、締切が壊れているように見えていた。
// 開けば決まることが分かる表示に変わっているか確認する。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  const pastDl = new Date(Date.now()-3600000).toISOString();     // 1時間前に締切済み
  const cand = { id:'c1', date:new Date(Date.now()+86400000).toISOString() };

  await ctx.addInitScript(({pastDl, cand}) => {
    const s={groups:{g1:{id:'g1', name:'テスト班', members:[]}},
      events:{ev1:{ id:'ev1', title:'期限切れの日程', group_name:'テスト班', host:'けんじ', slot:'12:15 - 13:00',
        place:null, memo:null, group_id:'g1', deadline:pastDl, members:['けんじ'],
        candidates:[cand], confirmed:null, failed:false, feed:[], sent_reminders:[] }},
      answers:[], gm:[{group_id:'g1',member:'けんじ',joined_at:'1'}]};
    window.__s=s;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        if(this.t==='group_members') return {data:c(s.gm.filter(x=>x.group_id===this.f.group_id)),error:null};
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
  }, {pastDl, cand});

  await p.goto(TARGET+'#g=g1'); await p.waitForTimeout(1000);

  const text = await p.evaluate(()=>document.querySelector('.evlist')?.innerText || '');
  console.log('進行中カードの表示:', JSON.stringify(text));

  const ok = !text.includes('あと0時間') && text.includes('締切済み') && text.includes('開くと決まります');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（締切済みなのに「あと0時間」のまま）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
