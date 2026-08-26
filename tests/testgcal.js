const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:900,height:1400}});

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load|createClient/.test(m.text()))errs.push('CONSOLE: '+m.text());});
  await p.addInitScript(() => {
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        s.gm ||= [];
        if(this.t==='group_members'){
          if(this._o==='p'){ const r=this._r;
            if(!s.gm.some(x=>x.group_id===r.group_id&&x.member===r.member))
              s.gm.push({group_id:r.group_id,member:r.member,joined_at:String(1e6+s.gm.length)});
            typeof save==='function'&&save(); return {data:null,error:null}; }
          return {data:s.gm.filter(x=>x.group_id===this.f.group_id),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]||null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);return{data:null,error:null};}
        if(this._in)return{data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });
  await p.goto(TARGET); await p.waitForTimeout(800);
  await p.fill('#ngName','JPHacks2026ファン組'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);
  console.log('① グループ画面のカレンダー:', await p.evaluate(()=>document.querySelectorAll('.gcal .cell').length)+'セル');

  // カレンダーから直接選んで作る
  for (let i=0;i<3;i++) {                      // 押すたびに再描画されるので毎回取り直す
    const cells = await p.$$('.gcal .cell.addable:not(.sel)');
    await cells[0].click(); await p.waitForTimeout(200);
  }
  await p.waitForTimeout(300);
  console.log('② 選んだ日:', await p.evaluate(()=>state.gpick.length)+'日');
  await p.screenshot({path:'c1_group_pick.png', fullPage:true});
  await p.click('button.b:has-text("この3日で決める")'); await p.waitForTimeout(500);
  console.log('③ 作成画面に引き継がれたか:', await p.evaluate(()=>({画面:state.view, 候補日:state.nd.days.length})));
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);
  console.log('④ 作成:', await p.evaluate(()=>({候補:state.candidates.length, タイトル:state.title})));

  // 回答して確定させ、グループ画面に確定日が出るか
  await p.click('text=全部 ○'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("この内容で回答する")'); await p.waitForTimeout(600);
  await p.evaluate(()=>{ const ev=Object.values(window.__s.events)[0];
    ev.deadline=new Date(Date.now()-3600000).toISOString(); });
  await p.waitForTimeout(3800);
  console.log('⑤ 自動確定:', await p.evaluate(()=>state.confirmed?'した':'してない'));
  await p.click('.topbar button'); await p.waitForTimeout(1200);
  console.log('⑥ グループ画面に確定日が出るか:', await p.evaluate(()=>document.querySelectorAll('.gcal .cell.fixed').length)+'日');
  await p.screenshot({path:'c2_group_fixed.png', fullPage:true});

  const m = await b.newPage({viewport:{width:390,height:844}});

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await m.route('**cdn.jsdelivr.net**', r => r.abort());
  await m.goto(TARGET); await m.waitForTimeout(700);
  console.log('スマホ横はみ出し:', await m.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth));
  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
