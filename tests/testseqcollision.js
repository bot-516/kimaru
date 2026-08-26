const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// state.seq（候補日IDの採番用カウンタ）はDBに保存されない。fromRow()が読み込み直後に
// seqを合わせていなかったため、リロードや「招待リンクを新しいブラウザで開く」たびに
// seqが初期値（6）へ戻ってしまい、すでに6件以上の候補日を持つイベントに新しく
// 候補日を足すと、既存の候補日と同じIDが振られて事故る可能性があった。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  const dl = new Date(Date.now()+48*3600000).toISOString();
  const cand = n => { const d=new Date(Date.now()+ (n+2)*86400000); return {id:'c'+n, date:d.toISOString()}; };
  const candidates = [1,2,3,4,5,6].map(cand);   // 初期値の seq（6）と衝突しうるように6件用意

  await ctx.addInitScript(({candidates, dl}) => {
    const s={events:{ev1:{
      id:'ev1', title:'既存の日程', group_name:'テスト班', host:'けんじ', slot:'12:15 - 13:00',
      place:null, memo:null, group_id:null, deadline:dl, members:['けんじ'],
      candidates, confirmed:null, failed:false, feed:[], sent_reminders:[]
    }}, answers:[], groups:{}, gm:[]}; window.__s=s;
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
  }, {candidates, dl});

  // 「招待リンクを開いた」状態を再現：#e=ev1 で直接開く（新しいブラウザ／リロード相当）
  await p.goto(TARGET+'#e=ev1'); await p.waitForTimeout(1000);

  const before = await p.evaluate(()=>({ seq: state.seq, ids: state.candidates.map(c=>c.id) }));
  console.log('① 読み込み直後:', before);

  // ホスト（けんじ）として候補日を1件追加
  const after = await p.evaluate(()=>{
    state.me = state.host;
    const d = new Date(Date.now()+30*86400000);
    addCandidate(d.getFullYear(), d.getMonth()+1, d.getDate());
    return { ids: state.candidates.map(c=>c.id) };
  });
  await p.waitForTimeout(300);
  console.log('② 追加後の候補日ID:', after.ids);

  const uniq = new Set(after.ids);
  const ok = before.seq===7 && uniq.size===after.ids.length && after.ids.length===7;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（IDが衝突している、またはseqが合っていない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
