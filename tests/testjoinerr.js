const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// グループへの参加保存が失敗したとき、joinGroup() はロールバックしていなかった。
// state.gmembers には名前が残ったまま render() が続くので、その直後に新しい日程を作ると
// サーバーには存在しない「幽霊メンバー」がイベントの参加者として焼き込まれてしまう。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    // このテストが見たいのは「参加の保存が失敗したときのロールバック」だけ。
    // 3秒ごとの定期同期が途中で挟まると、別の不具合（membersTableのフォールバック）と
    // タイミング次第で混ざってしまうので、このテストの間だけ定期同期を止めておく。
    const _si = window.setInterval;
    window.setInterval = function(fn, ms, ...a) { if (ms===3000) return 0; return _si(fn, ms, ...a); };
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__failJoin=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        // group_members への書き込みも、その後のフォールバック（groups.update）も両方失敗させる。
        // 完全に保存できない状況（RLS拒否など）を再現するため。
        if (window.__failJoin && this.t==='group_members' && this._o==='p')
          return {data:null, error:{message:'permission denied (test)'}};
        if (window.__failJoin && this.t==='groups' && this._o==='u')
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

  // グループを作る（最初のメンバー＝けんじ、はちゃんと保存される）
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);

  // 参加保存が失敗する状態で「みなみ」が参加しようとする
  await p.evaluate(()=>{ window.__failJoin=true; });
  await p.click('button:has-text("別の人を追加する")'); await p.waitForTimeout(200);
  await p.fill('#gJoin','みなみ');
  await p.click('button:has-text("参加する")'); await p.waitForTimeout(600);

  const r1 = await p.evaluate(()=>({
    ローカルのメンバー: state.gmembers.slice(),
    自分: state.me,
    失敗表示: (document.querySelector('.toast')||{}).innerText||'（なし）' }));
  console.log('① 参加保存が失敗したときのローカル状態:', r1);

  // 回復してから日程を作る → 「みなみ」が幽霊のまま焼き込まれていないか。
  // カレンダーを実際にクリックしていくと3秒ごとの同期をまたいでしまい、
  // このテストの対象ではない別の不具合（membersTableのフォールバック）と混ざるので、
  // 候補日選びは直接関数を呼んで素早く進める（実クリックでの候補日選択は他のテストで確認済み）。
  await p.evaluate(()=>{ window.__failJoin=false; });
  await p.evaluate(()=>{
    const d1=new Date(); d1.setDate(d1.getDate()+10);
    const d2=new Date(); d2.setDate(d2.getDate()+11);
    const k=d=>`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
    togglePick(k(d1)); togglePick(k(d2)); startFromPick();
  });
  await p.waitForTimeout(200);
  await p.fill('#ndTitle','ミーティング');
  await p.click('button.b:has-text("作る")'); await p.waitForTimeout(800);
  const r2 = await p.evaluate(()=>({ イベントの参加者: state.members.slice() }));
  console.log('② 回復後に作った日程の参加者（みなみが混ざっていないか）:', r2);

  const ok = !r1.ローカルのメンバー.includes('みなみ') && r1.自分==='けんじ' &&
             r1.失敗表示.includes('失敗') && !r2.イベントの参加者.includes('みなみ');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（幽霊メンバーが残っている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
