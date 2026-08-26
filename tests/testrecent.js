const { chromium } = require('playwright');
const path = require('path');
// リポジトリ直下の index.html を対象にする
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1100}});
  const p = await ctx.newPage();

  // 本物のSupabaseライブラリを読み込ませない。読み込むと本物のDBに書いてしまう。
  // これを止めることで、偽サーバ（またはデモモード）だけで動く。
  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/ERR_TUNNEL|Failed to load|createClient/.test(m.text()))errs.push('CONSOLE: '+m.text());});
  await ctx.addInitScript(() => {
    // 偽DBはリロードで消えないようにしておく（本物のSupabaseは消えないため）
    const K='__fakedb';
    const load=()=>{ try{ return JSON.parse(sessionStorage.getItem(K))||{events:{},answers:[],groups:{},gm:[]}; }
                     catch(e){ return {events:{},answers:[],groups:{},gm:[]}; } };
    const s=load(); window.__s=s;
    const save=()=>{ try{ sessionStorage.setItem(K, JSON.stringify(s)); }catch(e){} };
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
        if(T){ if(this._o==='i'){T[this._r.id]=c(this._r);save();return{data:null,error:null};}
          if(this._o==='u'){if(T[this.f.id])Object.assign(T[this.f.id],c(this._r));save();return{data:null,error:null};}
          if(this.f.group_id!==undefined)return{data:Object.values(T).filter(r=>r.group_id===this.f.group_id),error:null};
          const r=T[this.f.id]||null;return{data:this._1?r:(r?[r]:[]),error:null};}
        if(this._o==='p'){const i=s.answers.findIndex(a=>a.event_id===this._r.event_id&&a.member===this._r.member);
          const r=c(this._r); if(i>=0)s.answers[i]=r;else s.answers.push(r);save();return{data:null,error:null};}
        if(this._in)return{data:s.answers.filter(a=>this._in[1].includes(a.event_id)),error:null};
        return{data:s.answers.filter(a=>a.event_id===this.f.event_id),error:null};}
      then(res,rej){return Promise.resolve(this.run()).then(res,rej);} }
    window.supabase={createClient:()=>({from:t=>new Q(t)})};
  });

  await p.goto(TARGET); await p.waitForTimeout(800);
  console.log('① 初回:', await p.evaluate(()=>state.view), '/ 覚えているグループ:', await p.evaluate(()=>recentGroups().length));
  await p.fill('#ngName','JPHacks2026ファン組'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);
  const gid = await p.evaluate(()=>state.gid);
  console.log('② 作成後に覚えたか:', await p.evaluate(()=>recentGroups().map(g=>g.name)));

  // 素のURLを開き直す（＝また「作る」画面が出ないか）
  await p.goto(TARGET); await p.waitForTimeout(800);
  console.log('③ 素のURLを開き直す:', await p.evaluate(()=>state.view),
              '/ 一覧に出ているか:', await p.evaluate(()=>document.body.innerText.includes('前に使ったグループ')));
  await p.screenshot({path:'r1_recent.png', fullPage:true});

  // 一覧から戻れるか
  console.log('  クリック前 DBのgroups:', await p.evaluate(()=>Object.keys(window.__s.groups)));
  console.log('  クリック前 覚えているid:', await p.evaluate(()=>recentGroups().map(g=>g.id)));
  await p.click('.ev'); await p.waitForTimeout(1500);
  console.log('④ 一覧から復帰:', await p.evaluate(()=>({画面:state.view, グループ:state.gname, ハッシュ:location.hash, 画面の文字:document.body.innerText.slice(0,60)})));

  // 2つ目のグループ
  await p.goto(TARGET); await p.waitForTimeout(700);
  await p.click('button.b.line'); await p.waitForTimeout(400);
  await p.fill('#ngName','バイトの人たち'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);
  await p.goto(TARGET); await p.waitForTimeout(800);
  console.log('⑤ 2つ覚えているか:', await p.evaluate(()=>recentGroups().map(g=>g.name)));
  await p.screenshot({path:'r2_two.png', fullPage:true});

  // 保存できない環境でも動くか
  // 保存できない環境（プライベートウィンドウ等）でも壊れないか
  await p.evaluate(()=>{ Object.defineProperty(window,'localStorage',{configurable:true,get(){ throw new Error('保存不可'); }}); });
  const r6 = await p.evaluate(()=>{
    const o={};
    try { o.読み取り = recentGroups().length + '件（例外なし）'; } catch(e){ o.読み取り='例外: '+e.message; }
    try { rememberGroup('x','y'); o.書き込み='例外なし'; } catch(e){ o.書き込み='例外: '+e.message; }
    try { openNewGroup(); o.画面 = state.view + ' / 入力欄' + document.querySelectorAll('.frow').length + '個'; }
    catch(e){ o.画面='例外: '+e.message; }
    return o;
  });
  console.log('⑥ 保存できない環境:', r6);
  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  await b.close();
})();
