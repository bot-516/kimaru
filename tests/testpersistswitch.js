const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// persist()の完了時に lastRow=row を代入する処理が、eventIdの一致を見ていなかった。
// イベントAへの保存が通信の遅れでまだ終わっていないうちにイベントBへ切り替えると、
// 遅れて届いたAの保存完了が「Bのlastrow」を「Aの内容」で上書きしてしまう。
// その状態でAを開き直すと、pull()のガードが「id一致・中身は不一致」と誤判定し、
// まだ画面に残っていたBの内容をAのDB行として保存してしまう（イベントの中身が入れ替わる）。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const _si = window.setInterval;
    window.setInterval = function(fn, ms, ...a) { if (ms===3000) return 0; return _si(fn, ms, ...a); };
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s;
    window.__holdEvent=null; window.__release=null;
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
          if(this._o==='u'){
            // 指定したイベントIDへの書き込みだけ、release()が呼ばれるまで完了させない。
            if (this.t==='events' && window.__holdEvent===this.f.id) {
              const id=this.f.id, val=c(this._r);
              return new Promise(res=>{ window.__release=()=>{
                window.__holdEvent=null;    // 一度保留したら、以後の書き込みは通常どおり進める
                if (T[id]) Object.assign(T[id],val); res({data:null,error:null}); }; });
            }
            if (T[this.f.id]) Object.assign(T[this.f.id],c(this._r)); return{data:null,error:null};}
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
    return p.evaluate(()=>eventId);
  }

  await p.goto(TARGET); await p.waitForTimeout(800);
  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);

  const idA = await createEvent('イベントA');
  console.log('準備: イベントA作成', idA);

  // Aの締切変更が通信の遅れで保留になる
  await p.evaluate((id)=>{ window.__holdEvent=id; }, idA);
  await p.evaluate(()=>{
    const d=new Date(); d.setDate(d.getDate()+3);
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T10:00`;
    setDeadline(v);
  });
  await p.waitForTimeout(200);

  // 保留中に、Bへ切り替える（AのDBへの書き込みはまだ終わっていない）
  await p.evaluate(()=>{ backToGroup(); }); await p.waitForTimeout(300);
  const idB = await createEvent('イベントB');
  console.log('準備: イベントB作成（Aの保存が保留のまま）', idB);

  // ここでAの保存がようやく完了する（Bに切り替わった後）
  await p.evaluate(()=>window.__release());
  await p.waitForTimeout(300);

  // Aを開き直す。中身が入れ替わっていないか。
  await p.evaluate(()=>{ backToGroup(); }); await p.waitForTimeout(300);
  await p.click(`button.ev:has-text("イベントA")`);
  await p.waitForTimeout(500);

  const rowA = await p.evaluate((id)=>window.__s.events[id], idA);
  const rowB = await p.evaluate((id)=>window.__s.events[id], idB);
  console.log('① AのDB行のタイトル（イベントAのままであるべき）:', rowA.title);
  console.log('② BのDB行のタイトル（イベントBのままであるべき）:', rowB.title);

  const ok = rowA.title==='イベントA' && rowB.title==='イベントB';

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（別イベントの内容が書き込まれた）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
