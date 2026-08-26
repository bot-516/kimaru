-- ============================================================
-- キマる — メンバーが消えるバグを直すための追加SQL
--
-- 使い方：
--   Supabase の左メニュー「SQL Editor」を開いて、
--   この中身を全部コピペして「Run」を押すだけです。1回でおわりです。
--
-- 何が起きていたか：
--   これまでメンバー一覧は、グループの1行の中に
--   ["けんじ","りくと",...] という配列でまとめて入っていました。
--   この形だと、AさんとBさんがほぼ同時に参加したとき、
--   後から保存した方が「自分が知っている一覧」で丸ごと上書きするので、
--   前の人の名前が消えます。
--
--   回答（answers）は最初からこの事故を避けるため
--   「1イベント1人1行」にしてありました。同じことをメンバーにもします。
-- ============================================================


-- ------------------------------------------------------------
-- ① メンバーのテーブル（1グループ1人1行）
--    primary key を (group_id, member) にしているので、
--    同じ人が二重に入ることもありません。
-- ------------------------------------------------------------
create table if not exists group_members (
  group_id   text not null references groups(id) on delete cascade,
  member     text not null,                       -- 参加した人の名前
  joined_at  timestamptz not null default now(),  -- 並び順に使う
  primary key (group_id, member)
);


-- ------------------------------------------------------------
-- ② アクセス許可
--    events / answers と同じ、デモ用のゆるい設定です。
--    本番なら認証を入れる場所、という認識だけ持っておいてください。
-- ------------------------------------------------------------
alter table group_members enable row level security;

drop policy if exists demo_group_members on group_members;

create policy demo_group_members on group_members for all using (true) with check (true);


-- ------------------------------------------------------------
-- ③ 今あるグループのメンバーを、新しいテーブルへ移す
--    すでに作ったグループの人が消えないように、引っ越しをします。
--    （アプリ側にも同じ引っ越し処理を入れてあるので、
--      ここを実行し忘れても、そのグループを開いた時点で移ります）
-- ------------------------------------------------------------
insert into group_members (group_id, member)
select g.id, m.value
from groups g,
     lateral jsonb_array_elements_text(coalesce(g.members, '[]'::jsonb)) as m(value)
on conflict (group_id, member) do nothing;


-- ------------------------------------------------------------
-- ④ 確認
--    左メニュー「Table Editor」に group_members が出ていて、
--    今あるグループの人数ぶん行があれば成功です。
-- ------------------------------------------------------------
