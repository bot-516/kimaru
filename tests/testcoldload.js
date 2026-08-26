const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// 招待リンクを開いた最初の1回だけ、events select が「例外なしのerror」を返す状況を再現する。
// これまでは1回でも失敗すると「見つかりません」と同じ扱いになり、URLのハッシュを消して
// 入口画面に戻していた。ただの電波不良でも、本物のリンクが無効扱いになっていた。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});

  async function withServer(page, opts) {
    await page.route('**cdn.jsdelivr.net**', r => r.abort());
    await page.addInitScript((opts) => {
      const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s;
      // 事前に1件だけイベントを仕込んでおく
      s.events[opts.id] = { id:opts.id, title:'ミーティング', group_name:'テスト班', host:'けんじ',
        slot:'12:15 - 13:00', place:null, memo:null, group_id:null,
        deadline:new Date(Date.now()+3*3600000).toISOString(),
        members:['けんじ'], candidates:[{id:'c1',date:new Date(Date.now()+24*3600000).toISOString()}],
        confirmed:null, failed:false, feed:[], sent_reminders:[] };
      window.__failN = opts.failN;
      class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
        insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
        upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
        eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
        order(){return this;} maybeSingle(){this._1=true;return this;}
        run(){ const c=x=>JSON.parse(JSON.stringify(x));
          if (this.t==='events' && this._o==='s' && this._1 && window.__failN>0) {
            window.__failN--; return {data:null, error:{message:'network error (test)'}};
          }
          if(this.t==='group_members'){
            return {data:c(s.gm.filter(x=>x.group_id===this.f.group_id)),error:null};
          }
          const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
          if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);return{data:null,error:null};}
            if(this._o==='u'){ if(T[this.f.id]) Object.assign(T[this.f.id],c(this._r)); return{data:null,error:null};}
            if(this.f.group_id!==undefined)return{data:c(Object.values(T).filter(r=>r.group_id===this.f.group_id)),error:null};
            const r=T[this.f.id]?c(T[this.f.id]):null;return{data:this._1?r:(r?[r]:[]),error:null};}
          if(this._in)return{data:c(s.answers.filter(a=>this._in[1].includes(a.event_id))),error:null};
          return{data:c(s.answers.filter(a=>a.event_id===this.f.event_id)),error:null};}
        then(res,rej){ try { return Promise.resolve(this.run()).then(res,rej); } catch(e){ return Promise.reject(e).then(res,rej); } } }
      window.supabase={createClient:()=>({from:t=>new Q(t)})};
    }, opts);
  }

  // ① 最初の1回だけ失敗 → それでも本物のイベントが開けるか
  {
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
    await withServer(p, {id:'ev001', failN:1});
    await p.goto(TARGET+'#e=ev001'); await p.waitForTimeout(2500);
    const r = await p.evaluate(()=>({ 画面:state.view, ハッシュ:location.hash, タイトル:state.title }));
    console.log('① 1回だけ失敗しても開けるか:', r, 'エラー:', errs.length?errs.join(' / '):'なし');
    if (r.画面==='newgroup' || r.ハッシュ!=='#e=ev001' || r.タイトル!=='ミーティング' || errs.length) {
      console.log('判定: NG'); await b.close(); process.exit(1);
    }
    await p.close();
  }

  // ② ずっと失敗し続ける（本物に存在しない場合と区別できないケース）→ 従来通り入口へ落ちるか
  {
    const p = await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
    await withServer(p, {id:'ev002', failN:99});
    await p.goto(TARGET+'#e=ev002'); await p.waitForTimeout(2500);
    const r = await p.evaluate(()=>({ 画面:state.view, ハッシュ:location.hash }));
    console.log('② ずっと失敗するときは入口に戻るか:', r, 'エラー:', errs.length?errs.join(' / '):'なし');
    const ok2 = r.画面==='newgroup' && r.ハッシュ==='' && !errs.length;
    console.log('エラー:', errs.length?errs.join('\n'):'なし');
    console.log('判定:', ok2 ? 'OK' : 'NG');
    await b.close();
    process.exit(ok2 ? 0 : 1);
  }
})();
