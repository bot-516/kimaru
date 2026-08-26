const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// createGroup() は groups へのinsertが成功した直後に addMember() が失敗すると、
// 誰も辿り着けない（作成者すら参加できていない）孤立した groups 行をDBに残していた。
// insert成功後に失敗したときは、その行を消しておくべき。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__failAllMemberWrites=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      delete(){this._o='d';return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        // 参加登録（本テーブルもフォールバックも）を必ず失敗させる。
        if (window.__failAllMemberWrites && this.t==='group_members' && this._o==='p')
          return {data:null, error:{message:'permission denied (test)'}};
        if (window.__failAllMemberWrites && this.t==='groups' && this._o==='u')
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
          if(this._o==='d'){ delete T[this.f.id]; return{data:null,error:null};}
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

  await p.evaluate(()=>{ window.__failAllMemberWrites=true; });
  await p.fill('#ngName','孤立するはずのグループ'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);

  const r1 = await p.evaluate(()=>({
    画面: state.view,
    失敗表示: (document.querySelector('.err')||{}).textContent||'（なし）',
    孤立行が残っているか: Object.keys(window.__s.groups).length>0 }));
  console.log('groups行insert成功→addMember失敗:', r1);

  const ok = r1.画面==='newgroup' && r1.失敗表示.includes('作れません') && !r1.孤立行が残っているか;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（孤立したgroups行が残っている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
