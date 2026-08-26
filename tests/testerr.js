const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// supabase-js は通信エラーで例外を投げるとは限らない。RLS拒否・制約違反・5xx等は
// 例外を投げずに { data:null, error:{...} } を返す。catch(e) だけに頼っている処理は
// これを検知できず、「できました」と表示したままDBには何も書かれない。
// このテストは insert() がその形（例外なし・error あり）で失敗する場合を偽サーバで再現する。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__softFail=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        // 例外は投げない。PostgRESTの実際の失敗はこう返ってくる。
        if (window.__softFail && this.t==='groups' && this._o==='i')
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

  // ---- グループ作成が「例外なしの error」で失敗する ----
  await p.evaluate(()=>{ window.__softFail=true; });
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(600);
  const r1 = await p.evaluate(()=>({
    画面:state.view,
    嘘の成功メッセージ:(document.querySelector('.toast')||{}).innerText||'（なし）',
    エラー表示:(document.querySelector('.err')||{}).textContent||'（なし）',
    入力が残っているか:document.getElementById('ngName')?.value ?? '（欄が消えた）',
    DBに書かれたか:Object.keys(window.__s.groups).length>0 }));
  console.log('① insertがerrorを返す（例外なし）ときの作成:', r1);

  // 回復して再試行できるか
  await p.evaluate(()=>{ window.__softFail=false; });
  await p.click('button.b'); await p.waitForTimeout(700);
  const r2 = await p.evaluate(()=>({ 画面:state.view, DBに書かれたか:Object.keys(window.__s.groups).length>0 }));
  console.log('   回復後:', r2);

  const ok = r1.画面==='newgroup' && !r1.嘘の成功メッセージ.includes('できました') &&
             r1.エラー表示!=='（なし）' && r1.入力が残っているか==='テスト班' && !r1.DBに書かれたか &&
             r2.画面==='group' && r2.DBに書かれたか;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（失敗を検知できていない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
