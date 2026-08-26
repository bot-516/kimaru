const { chromium } = require('playwright');
const path = require('path');
const TARGET = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// group_members への書き込みが「テーブルが無い」以外の理由（一時的な通信エラー等）で
// 一度失敗しただけで membersTable が false に固定され、以後ずっと危険な配列書き込み
// （groups.members）にフォールバックし続けてしまっていた。
// 「テーブルが無い」（PostgRESTの42P01）のときだけ恒久的に諦めるべきで、
// 一時的な失敗は次の書き込みで普通に group_members を使い直せるべき。
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:900,height:1300}});
  const p = await ctx.newPage();

  await p.route('**cdn.jsdelivr.net**', r => r.abort());
  const errs=[]; p.on('pageerror',e=>errs.push('ERR: '+e.message));

  await ctx.addInitScript(() => {
    const _si = window.setInterval;
    window.setInterval = function(fn, ms, ...a) { if (ms===3000) return 0; return _si(fn, ms, ...a); };
    const s={events:{},answers:[],groups:{},gm:[]}; window.__s=s; window.__failOnce=false;
    class Q{ constructor(t){this.t=t;this.f={};this._in=null;}
      insert(r){this._o='i';this._r=r;return this;} update(r){this._o='u';this._r=r;return this;}
      upsert(r){this._o='p';this._r=r;return this;} select(){this._o='s';return this;}
      eq(c,v){this.f[c]=v;return this;} in(c,v){this._in=[c,v];return this;}
      order(){return this;} maybeSingle(){this._1=true;return this;}
      run(){ const c=x=>JSON.parse(JSON.stringify(x));
        // 「テーブルが無い」のではない、一時的な失敗（コネクション断など）を1回だけ起こす。
        // 42P01を付けないのがポイント：本当にテーブルが無いわけではないことを表す。
        if (window.__failOnce && this.t==='group_members' && this._o==='p') {
          window.__failOnce=false;
          return {data:null, error:{message:'connection reset (test)', code:'08006'}};
        }
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

  await p.fill('#ngName','テスト班'); await p.fill('#ngMe','けんじ');
  await p.click('button.b'); await p.waitForTimeout(700);

  // 1人目（みなみ）の参加保存を1回だけ一時的に失敗させる
  await p.evaluate(()=>{ window.__failOnce=true; });
  await p.click('button:has-text("別の人を追加する")'); await p.waitForTimeout(200);
  await p.fill('#gJoin','みなみ');
  await p.click('button:has-text("参加する")'); await p.waitForTimeout(600);
  const r1 = await p.evaluate(()=>({
    ローカルのメンバー: state.gmembers.slice(),
    失敗表示: (document.querySelector('.toast')||{}).innerText||'（なし）' }));

  // 続けて2人目（りくと）が参加 → 一時的な失敗のあとでも group_members を使い続けているか
  // （失敗しても入力フォームは開いたままなので、「別の人を追加する」を押し直す必要は無い）
  await p.fill('#gJoin','りくと');
  await p.click('button:has-text("参加する")'); await p.waitForTimeout(600);
  const r2 = await p.evaluate(()=>({
    ローカルのメンバー: state.gmembers.slice(),
    group_membersに書かれた行: window.__s.gm.map(x=>x.member),
    groups側の配列フォールバックが使われていないか: (window.__s.groups[state.gid]||{}).members }));

  console.log('① 一時的な失敗の直後:', r1);
  console.log('② 回復後の2人目の参加:', r2);

  const ok = !r1.ローカルのメンバー.includes('みなみ') && r1.失敗表示.includes('失敗') &&
             r2.ローカルのメンバー.includes('りくと') &&
             r2.group_membersに書かれた行.includes('りくと') &&
             (r2.groups側の配列フォールバックが使われていないか||[]).length===0;

  console.log('エラー:', errs.length?errs.join('\n'):'なし');
  console.log('判定:', ok ? 'OK' : 'NG（一時的な失敗でmembersTableが恒久的に落ちている）');
  await b.close();
  process.exit(ok && !errs.length ? 0 : 1);
})();
