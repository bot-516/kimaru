const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// state.me はデモモードの初期状態で「りくと」が入っている（画面のサンプル用）。
// 共有モードに切り替わってもこの値をリセットしていなかったため、実在のグループに
// たまたま「りくと」という名前のメンバーがいると、初めてリンクを開いた人が
// 何も選んでいないのに、その人として回答できる状態になってしまっていた。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={groups:{g1:{id:'g1', name:'テスト班', members:[]}}, events:{}, answers:[],
      gm:[{group_id:'g1',member:'りくと',joined_at:'1'},{group_id:'g1',member:'けんじ',joined_at:'2'}]};
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
  });

  await p.goto(TARGET+'#g=g1'); await p.waitForTimeout(1000);

  const r = await p.evaluate(()=>({ me: state.me, members: state.gmembers.slice() }));
  console.log('初めて「りくと」がいる本物のグループを開いたときのstate.me:', r);

  const ok = r.me==='' && r.members.includes('りくと') && r.members.includes('けんじ');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（勝手に「りくと」として振る舞っている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
