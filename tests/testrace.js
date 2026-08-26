const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const NAMES = ['けんじ','りくと','あおい','はると','ゆい'];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1400}});
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load|createClient/.test(m.text()))errs.push('CONSOLE: '+m.text());});

  // 偽サーバ。往復に遅延を入れて、同時参加の競合を再現できるようにする
  await ctx.addInitScript(() => {
    const K='__fakedb2';
    const load=()=>{ try{ return JSON.parse(sessionStorage.getItem(K))||{events:{},answers:[],groups:{},gm:[]}; }
                     catch(e){ return {events:{},answers:[],groups:{},gm:[]}; } };
    const s=load(); s.gm ||= []; window.__s=s;
    const save=()=>{ try{ sessionStorage.setItem(K, JSON.stringify(s)); }catch(e){} };
    const LAG = () => new Promise(r=>setTimeout(r, 120 + Math.floor(Math.sin(s.gm.length*7.3)*40+40)));
    let seq = 0;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      async run(){ await LAG(); const c=x=>JSON.parse(JSON.stringify(x));
        if(this.t==='group_members'){
          if(this._o==='p'){ const r=this._r;
            if(!s.gm.some(x=>x.group_id===r.group_id&&x.member===r.member))
              s.gm.push({group_id:r.group_id,member:r.member,joined_at:String(1e6+(seq++)).padStart(9,'0')});
            save(); return {data:null,error:null}; }
          return {data:s.gm.filter(x=>x.group_id===this.f.group_id),error:null};
        }
        const T=this.t==='groups'?s.groups:this.t==='events'?s.events:null;
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);save();return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));save();return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]||null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);save();return{data:null,error:null};}
        if(this._in)return{data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return this.run().then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  await p.goto(TARGET); await p.waitForTimeout(900);
  await p.fill('#ngName','ハッカソン班'); await p.fill('#ngMe',NAMES[0]);
  await p.click('button.b'); await p.waitForTimeout(1200);
  const gid = await p.evaluate(()=>state.gid);
  console.log('① 作成:', await p.evaluate(()=>state.gmembers));

  // ★ 4人が「同時に」参加する。待たずに一斉に投げる
  await p.evaluate(async names => {
    await Promise.all(names.map(async n => {
      state.joining=true; render();
      const el=document.getElementById('gJoin'); if(el) el.value=n;
      await joinGroup();
    }));
  }, NAMES.slice(1));
  await p.waitForTimeout(1500);
  console.log('② 同時参加の直後（画面）:', await p.evaluate(()=>state.gmembers));

  // サーバに何人残っているか
  await p.goto(TARGET+'#g='+gid); await p.waitForTimeout(2000);
  const after = await p.evaluate(()=>state.gmembers);
  console.log('③ 開き直し（サーバの中身）:', after, '→', after.length+'人');
  console.log('   全員そろったか:', NAMES.every(n=>after.includes(n)) ? '○ OK' : '× 欠けている: '+NAMES.filter(n=>!after.includes(n)));

  // 旧いグループ（配列で持っていたもの）が引っ越せるか
  const oldId = await p.evaluate(async () => {
    const id='oldgrp01';
    await db.from('groups').insert({ id, name:'前からあるグループ', members:['さやか','たける','みなみ'] });
    return id;
  });
  await p.goto(TARGET+'?r=1#g='+oldId); await p.waitForTimeout(2500);
  console.log('④ 旧グループを開く:', await p.evaluate(()=>({gid:state.gid, view:state.view, ms:state.gmembers, groups:Object.keys(window.__s.groups)})));
  await p.goto(TARGET+'?r=2#g='+oldId); await p.waitForTimeout(2500);
  console.log('⑤ もう一度開く（引っ越し済みか）:', await p.evaluate(()=>state.gmembers),
              '/ 行数:', await p.evaluate(()=>window.__s.gm.filter(x=>x.group_id==='oldgrp01').length));

  // 二重参加が増えないか
  await p.evaluate(async ()=>{ state.joining=true; render();
    document.getElementById('gJoin').value='さやか'; await joinGroup(); });
  await p.waitForTimeout(1200);
  console.log('⑥ 同じ名前で再参加:', await p.evaluate(()=>state.gmembers));

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
