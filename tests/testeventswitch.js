const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// pull() に足した「未確定の編集があるなら上書きしない」ガードは、lastRow が別のイベントの
// ものだった場合（openEvent()やbackToGroup()でイベントを切り替えた直後）を考えていなかった。
// イベントAを作る→グループに戻る→イベントBを作る→戻る→イベントAを開き直す、という
// ごく普通の操作で、「作成しました」というBの通知がAの回答データとして書き込まれてしまっていた。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    // このテストは openEvent() 直後の1回の pull() だけを見たいので、
    // 3秒ごとの定期同期は止めておく（自然なタイミング差で結果がぶれないように）。
    const _si = window.setInterval;
    window.setInterval = function(fn, ms, ...a) { if (ms===3000) return 0; return _si(fn, ms, ...a); };
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
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

  async function createEvent(title) {
    for (let i=0;i<2;i++){ const cs=await p.$$('.gcal .cell.addable:not(.sel)'); await cs[0].click(); await p.waitForTimeout(120); }
    await p.click('button:has-text("この2日で決める")'); await p.waitForTimeout(300);
    await p.fill('#ndTitle', title);
    await p.click('button.b:has-text("作る")'); await p.waitForTimeout(400);
    // わざと persist() を呼ばない。「作成しました」のフィード追加はまだサーバーに届いていない
    // （＝lastRowとstateが食い違ったまま）状態で、次の画面遷移に移る。
    return p.evaluate(()=>eventId);
  }

  await p.goto(TARGET); await p.waitForTimeout(800);
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);

  const idA = await createEvent('イベントA');
  await p.evaluate(()=>{ backToGroup(); }); await p.waitForTimeout(200);

  const idB = await createEvent('イベントB');
  await p.evaluate(()=>{ backToGroup(); }); await p.waitForTimeout(200);

  // イベントAを開き直す。ここで走る pull() が1回目の同期。
  await p.click(`button.ev:has-text("イベントA")`);
  await p.waitForTimeout(500);

  const rowA = await p.evaluate((id)=>window.__s.events[id], idA);
  const rowB = await p.evaluate((id)=>window.__s.events[id], idB);
  const feedA = (rowA.feed||[]).map(f=>f.msg).join(' / ');
  const feedB = (rowB.feed||[]).map(f=>f.msg).join(' / ');
  console.log('① Aのフィード（Bの内容が紛れ込んでいないか）:', feedA);
  console.log('② Bのフィード（Aによって上書きされていないか）:', feedB);

  const ok = !feedA.includes('イベントB') && !feedB.includes('イベントA');

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（別イベントのデータが混ざった）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
