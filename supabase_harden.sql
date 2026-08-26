-- ============================================================
-- キマる — 削除だけを禁止する（任意・おすすめ）
--
-- 使い方：SQL Editor に貼って Run。1回でおわりです。
--
-- 今の状態：
--   ログイン機能がないので、アクセス許可は「誰でも読み書きしてよい」に
--   してあります。ページのソースには接続キー（公開用）が書いてあるので、
--   その気になれば誰でも直接データを触れます。
--   これはデモとしては普通の判断ですが、「消される」だけは
--   取り返しがつかないので、そこだけ塞いでおきます。
--
--   アプリは削除を一切使っていないので、これを入れても動作は変わりません。
--   （テストデータを消したくなったら Table Editor から消せます）
-- ============================================================

-- 「なんでもあり」の許可を外して、読む・足す・書き換えるだけにする
drop policy if exists demo_events        on events;
drop policy if exists demo_answers       on answers;
drop policy if exists demo_group_members on group_members;
drop policy if exists demo_groups        on groups;

create policy ev_read on events for select using (true);
create policy ev_add  on events for insert with check (true);
create policy ev_edit on events for update using (true) with check (true);

create policy an_read on answers for select using (true);
create policy an_add  on answers for insert with check (true);
create policy an_edit on answers for update using (true) with check (true);

create policy gm_read on group_members for select using (true);
create policy gm_add  on group_members for insert with check (true);

create policy gr_read on groups for select using (true);
create policy gr_add  on groups for insert with check (true);
create policy gr_edit on groups for update using (true) with check (true);

-- delete のポリシーを1つも作らない ＝ 誰も消せない、という意味になります。


-- ------------------------------------------------------------
-- 正直に言っておくこと
--   これは「壊されにくくする」だけで、「守っている」わけではありません。
--   URLを知っている人が中身を書き換えられる状態は変わりません。
--   本当に守るならログイン（Supabase Auth）を入れて、
--   「主催者だけが締切と候補日を変えられる」をサーバ側で判定する必要があります。
--   ハッカソンでは、そこまでやっていないことを説明できれば十分です。
-- ------------------------------------------------------------
