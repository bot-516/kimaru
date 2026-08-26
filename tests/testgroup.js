const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:900,height:1300}});

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
        const T = this.t==='groups'?s.groups : this.t==='events'?s.events : null;
        if (T) {
          if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));return{data:null,error:null};}
          if(this.f.group_id!==undefined) return {data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]||null; return{data:this._1?r:(r?[r]:[]),error:null};
        }
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r); return{data:null,error:null};}
        if(this._in) return {data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  await p.goto(TARGET); await p.waitForTimeout(900);
  console.log('① 最初の画面:', await p.evaluate(()=>state.view));
  await p.screenshot({path:'g1_newgroup.png', fullPage:true});

  // グループ作成
  await p.fill('#ngName','JPHacks2026ファン組'); await p.fill('#ngMe','けんじ');
  await p.click("button.b"); await p.waitForTimeout(700);
  console.log('② グループ作成後:', await p.evaluate(()=>({画面:state.view, ハッシュ:location.hash, 名前:state.gname, メンバー:state.gmembers, 自分:state.me})));
  await p.screenshot({path:'g2_group.png', fullPage:true});

  // 1件目の日程を作る
  await p.click('button.b:has-text("新しい日程")'); await p.waitForTimeout(400);
  console.log('③ 作成画面に名前欄が出ないか:', await p.evaluate(()=>!document.getElementById('ndHost')));
  await p.fill('#ndTitle','昼休み集まれる日');
  await p.click('button:has-text("これからの平日5日")'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(900);
  console.log('④ イベント作成後:', await p.evaluate(()=>({画面:state.view, メンバー:state.members, グループid:state.groupId, 候補:state.candidates.length})));

  // 回答
  await p.click('text=全部 ○'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("この内容で回答する")'); await p.waitForTimeout(600);

  // グループに戻る
  await p.click('.topbar button'); await p.waitForTimeout(1200);
  console.log('⑤ グループに戻る:', await p.evaluate(()=>({画面:state.view, ハッシュ:location.hash, 進行中:state.gevents.length})));
  await p.screenshot({path:'g3_group_with_event.png', fullPage:true});

  // 2件目 ＝ URLを貼り直さずに作れるか
  await p.click('button.b:has-text("新しい日程")'); await p.waitForTimeout(400);
  await p.fill('#ndTitle','打ち上げ');
  await p.click('button:has-text("これからの土日4日")'); await p.waitForTimeout(200);
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(900);
  console.log('⑥ 2件目:', await p.evaluate(()=>({タイトル:state.title, メンバー:state.members})));
  await p.click('.topbar button'); await p.waitForTimeout(1200);
  console.log('⑦ グループ内のイベント数:', await p.evaluate(()=>state.gevents.length));
  await p.screenshot({path:'g4_two_events.png', fullPage:true});

  // 別の人がグループURLを開く
  const q = await b.newPage({viewport:{width:390,height:844}});

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await q.route('**cdn.jsdelivr.net**', r => r.abort());
  q.on('pageerror',e=>errs.push('ERR2: '+e.message));
  await q.addInitScript(() => { window.__shared=true; });
  const gid = await p.evaluate(()=>state.gid);
  await q.addInitScript((store) => {
    const s=store; window.__s=s;
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
            return {data:null,error:null}; }
          return {data:s.gm.filter(x=>x.group_id===this.f.group_id),error:null};
        }
        const T = this.t==='groups'?s.groups : this.t==='events'?s.events : null;
        if (T) {
          if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));return{data:null,error:null};}
          if(this.f.group_id!==undefined) return {data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]||null; return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r); return{data:null,error:null};}
        if(this._in) return {data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  }, await p.evaluate(()=>window.__s));
  await q.goto(TARGET+'#g='+gid); await q.waitForTimeout(1000);
  console.log('⑧ 別の人がURLを開く:', await q.evaluate(()=>({画面:state.view, グループ名:state.gname, 見えるイベント:state.gevents.length, 自分:state.me||'（未選択）'})));
  await q.screenshot({path:'g5_other_person.png', fullPage:true});
  await q.fill('#gJoin','みなみ'); await q.click('button.b:has-text("参加する")'); await q.waitForTimeout(500);
  console.log('⑨ 参加後:', await q.evaluate(()=>({メンバー:state.gmembers, 自分:state.me})));
  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
