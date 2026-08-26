const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// saveAnswer()/saveGroup() は supabase-js の戻り値の error を見ていなかった。
// PostgRESTの実際の失敗は例外を投げず { data:null, error:{...} } の形で返るので、
// これらの関数はDBに書き込めていないのに「回答済み」「できました」のまま進んでいた。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1400}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__failAnswer=false; window.__failGroupSave=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        // 例外は投げない。PostgRESTの実際の失敗はこう返ってくる。
        if (window.__failAnswer && this.t==='answers' && this._o==='p')
          return {data:null, error:{message:'permission denied (test)'}};
        if (window.__failGroupSave && this.t==='groups' && this._o==='u')
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

  // ---------- 準備：グループ＋日程1件 ----------
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(900);
  const cs1=await p.$$('.gcal .cell.addable:not(.sel)'); await cs1[0].click(); await p.waitForTimeout(150);
  const cs2=await p.$$('.gcal .cell.addable:not(.sel)'); await cs2[0].click(); await p.waitForTimeout(150);
  await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(600);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(900);

  // ---------- ① saveAnswer() がerrorを返す（例外なし）ときの回答送信 ----------
  await p.evaluate(()=>go('answer')); await p.waitForTimeout(300);
  await p.evaluate(()=>{ window.__failAnswer=true; });
  await p.click('text=全部 ○'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("この内容で回答する")'); await p.waitForTimeout(600);
  const r1 = await p.evaluate(()=>({
    画面: state.view,
    回答済み扱いか: hasAnswered(state.me),
    失敗表示: (document.querySelector('.toast')||{}).innerText||'（なし）',
    DBに書かれたか: window.__s.answers.length>0 }));
  console.log('① saveAnswer()がerrorを返すときの回答送信:', r1);

  // 回復して再送できるか
  await p.evaluate(()=>{ window.__failAnswer=false; });
  await p.click('button.b:has-text("この内容で回答する")'); await p.waitForTimeout(700);
  const r2 = await p.evaluate(()=>({ 画面: state.view, DBに書かれたか: window.__s.answers.length>0 }));
  console.log('   回復後:', r2);

  // ---------- ② saveGroup() がerrorを返す（例外なし） ----------
  const r3 = await p.evaluate(async ()=>{
    window.__failGroupSave=true;
    state.gname='新しい名前';
    let threw=false;
    try { await saveGroup(); } catch(e) { threw=true; }
    return { 失敗表示:(document.querySelector('.toast')||{}).innerText||'（なし）',
             DBに反映されたか:(window.__s.groups[state.gid]||{}).name==='新しい名前',
             例外で落ちたか:threw };
  });
  console.log('② saveGroup()がerrorを返すとき:', r3);

  const ok = r1.画面==='answer' && !r1.回答済み扱いか && r1.失敗表示.includes('失敗') && !r1.DBに書かれたか &&
             r2.画面==='board' && r2.DBに書かれたか &&
             r3.失敗表示.includes('失敗') && !r3.DBに反映されたか && !r3.例外で落ちたか;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（保存失敗を検知できていない）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
