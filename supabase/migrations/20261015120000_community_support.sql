-- ═══════════════════════════════════════════════════════════════════════════
-- Karta-AD · «Отзывы и поддержка»: сообщество + личные обращения + панель
-- разработчика. Переносит раздел /reviews из одного голосования в систему
-- из трёх направлений (см. раздел задачи): публичные посты, приватные
-- тикеты, ответы разработчиков.
--
-- Перечни категорий/статусов ниже — единственный источник истины (CHECK).
-- Клиентские константы src/lib/supportConfig.js обязаны совпадать с ними —
-- это проверяет src/test/supportParity.test.js (читает этот файл).
--
-- Ключевые решения безопасности:
--   * Роль «разработчик» — таблица public.support_developers БЕЗ клиентских
--     INSERT/UPDATE/DELETE-политик. Роль profiles.role НЕ используется:
--     её можно купить через request_role_change, значению из профиля
--     доверять нельзя (требование задачи §5).
--   * Файлы: bucket community-photos (public, для публичных фото) и
--     support-photos (private, подписанные ссылки). Содержимое/размер
--     проверяются по storage.objects (is_valid_photo) — не по MIME из
--     браузера.
--   * Обращения читает только автор и разработчики; статусы меняет только
--     разработчик; developer_notes недоступны пользователям вообще.
--
-- Применять по одному statement; после DDL: SELECT pg_notify('pgrst','reload schema');
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Роль разработчика: отдельная таблица полномочий ──────────────────────

CREATE TABLE IF NOT EXISTS public.support_developers (
  user_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_developers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_support_developer()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_developers WHERE user_id = auth.uid()
  );
$$;

-- Читать membership может сам пользователь (для ворот интерфейса) и
-- разработчики (для назначения ответственных). Ни INSERT, ни UPDATE, ни
-- DELETE политик нет — через API роль не выдать и не забрать, только
-- service_role (Dashboard SQL / MCP).
DROP POLICY IF EXISTS "support_developers_select" ON public.support_developers;
CREATE POLICY "support_developers_select" ON public.support_developers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_support_developer());

-- Бутстрап: разработчики, существовавшие на момент миграции (текущие админы
-- проекта). Последующие смены role='admin' в эту таблицу не попадают.
INSERT INTO public.support_developers (user_id)
SELECT id FROM public.profiles WHERE role = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Серверная проверка файла: путь в папке владельца, реальный MIME/размер из
-- metadata (то, что приняла Storage), расширение-изображение. Не доверяем
-- content-type из браузера — он совпадает с metadata, но расширение и
-- ограничение bucket всё равно режут исполняемые форматы. Создаётся до
-- политик, которые на неё ссылаются.
CREATE OR REPLACE FUNCTION public.is_valid_photo(
  p_bucket TEXT,
  p_path   TEXT,
  p_owner  UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = p_bucket
      AND o.name = p_path
      AND split_part(o.name, '/', 1) = p_owner::text
      AND lower(o.name) ~ '\.(jpg|jpeg|png|webp)$'
      AND (o.metadata ->> 'mimetype') IN ('image/jpeg', 'image/png', 'image/webp')
      AND (o.metadata ->> 'size')::bigint BETWEEN 1 AND 5242880
  );
$$;

-- ─── 2. Публичное сообщество ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.community_posts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('routes', 'transit', 'taxi', 'map_issues', 'ideas', 'questions', 'other')),
  title      TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 150),
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 5000),
  status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  status     TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'helpful' CHECK (kind IN ('helpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id   UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'other')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS public.community_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_posts_feed     ON public.community_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_author   ON public.community_posts (author_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_category ON public.community_posts (category);
CREATE INDEX IF NOT EXISTS idx_community_comments_post  ON public.community_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_reports_target ON public.community_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_community_photos_post    ON public.community_photos (post_id);

ALTER TABLE public.community_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_photos   ENABLE ROW LEVEL SECURITY;

-- Посты: читают опубликованное (+ автор свои и скрытые, разработчики —
-- модерация); автор создаёт/правит только published и только своё;
-- статус скрытия меняет только разработчик.
DROP POLICY IF EXISTS "community_posts_select" ON public.community_posts;
CREATE POLICY "community_posts_select" ON public.community_posts
  FOR SELECT TO authenticated
  USING (status = 'published' OR author_id = auth.uid() OR public.is_support_developer());

DROP POLICY IF EXISTS "community_posts_insert" ON public.community_posts;
CREATE POLICY "community_posts_insert" ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND status = 'published');

DROP POLICY IF EXISTS "community_posts_update" ON public.community_posts;
CREATE POLICY "community_posts_update" ON public.community_posts
  FOR UPDATE TO authenticated
  USING ((author_id = auth.uid() AND status = 'published') OR public.is_support_developer())
  WITH CHECK ((author_id = auth.uid() AND status = 'published') OR public.is_support_developer());

DROP POLICY IF EXISTS "community_posts_delete" ON public.community_posts;
CREATE POLICY "community_posts_delete" ON public.community_posts
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_support_developer());

-- Комментарии: видны к опубликованным постам (+ свои и разработчики);
-- комментировать можно только опубликованное от своего имени.
DROP POLICY IF EXISTS "community_comments_select" ON public.community_comments;
CREATE POLICY "community_comments_select" ON public.community_comments
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR public.is_support_developer()
    OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "community_comments_insert" ON public.community_comments;
CREATE POLICY "community_comments_insert" ON public.community_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "community_comments_update" ON public.community_comments;
CREATE POLICY "community_comments_update" ON public.community_comments
  FOR UPDATE TO authenticated
  USING ((author_id = auth.uid() AND status = 'published') OR public.is_support_developer())
  WITH CHECK ((author_id = auth.uid() AND status = 'published') OR public.is_support_developer());

DROP POLICY IF EXISTS "community_comments_delete" ON public.community_comments;
CREATE POLICY "community_comments_delete" ON public.community_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_support_developer());

-- Реакции «Полезно»: только на видимые опубликованные посты, только свои,
-- дубликаты отсекает UNIQUE (подменить count нельзя — строки не подделать).
DROP POLICY IF EXISTS "community_reactions_select" ON public.community_reactions;
CREATE POLICY "community_reactions_select" ON public.community_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = post_id AND (p.status = 'published' OR p.author_id = auth.uid())
  ));

DROP POLICY IF EXISTS "community_reactions_insert" ON public.community_reactions;
CREATE POLICY "community_reactions_insert" ON public.community_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "community_reactions_delete" ON public.community_reactions;
CREATE POLICY "community_reactions_delete" ON public.community_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Жалобы: без правок и удалений; подать может только на реальный объект.
DROP POLICY IF EXISTS "community_reports_select" ON public.community_reports;
CREATE POLICY "community_reports_select" ON public.community_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_support_developer());

DROP POLICY IF EXISTS "community_reports_insert" ON public.community_reports;
CREATE POLICY "community_reports_insert" ON public.community_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND (
      (target_type = 'post' AND EXISTS (SELECT 1 FROM public.community_posts p WHERE p.id = target_id))
      OR (target_type = 'comment' AND EXISTS (SELECT 1 FROM public.community_comments c WHERE c.id = target_id))
    )
  );

-- Файлы сообщества: строка создаётся только к своему опубликованному посту
-- и только после серверной проверки файла (см. is_valid_photo ниже).
DROP POLICY IF EXISTS "community_photos_select" ON public.community_photos;
CREATE POLICY "community_photos_select" ON public.community_photos
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "community_photos_insert" ON public.community_photos;
CREATE POLICY "community_photos_insert" ON public.community_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.is_valid_photo('community-photos', storage_path, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = post_id AND p.author_id = auth.uid() AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "community_photos_delete" ON public.community_photos;
CREATE POLICY "community_photos_delete" ON public.community_photos
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_support_developer());

-- ─── 3. Личные обращения в поддержку ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number        BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category             TEXT NOT NULL CHECK (category IN ('app_error', 'map_broken', 'wrong_route', 'taxi_issue', 'account_issue', 'idea', 'other')),
  subject              TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 150),
  status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'awaiting_user', 'resolved', 'closed')),
  assigned_developer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_msg_id        UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at            TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_support_tickets_client_msg
  ON public.support_tickets (user_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'user' CHECK (message_type IN ('user', 'developer')),
  body         TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  client_msg_id UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_support_messages_client_msg
  ON public.support_messages (ticket_id, sender_id, client_msg_id)
  WHERE client_msg_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.developer_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  developer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body         TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES public.support_messages(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user     ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON public.support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket  ON public.support_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_messages_unread  ON public.support_messages (ticket_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_photos_ticket     ON public.ticket_photos (ticket_id);
CREATE INDEX IF NOT EXISTS idx_developer_notes_ticket   ON public.developer_notes (ticket_id);

ALTER TABLE public.support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_photos    ENABLE ROW LEVEL SECURITY;

-- Обращения: читают автор и разработчики; создать может только от своего
-- имени (новое, без ответственного); обновлять — только разработчик
-- (статус/ответственный/closed_at недоступны пользователю по определению).
DROP POLICY IF EXISTS "support_tickets_select" ON public.support_tickets;
CREATE POLICY "support_tickets_select" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_support_developer());

DROP POLICY IF EXISTS "support_tickets_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_insert" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'new' AND assigned_developer_id IS NULL);

DROP POLICY IF EXISTS "support_tickets_update" ON public.support_tickets;
CREATE POLICY "support_tickets_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_support_developer())
  WITH CHECK (public.is_support_developer());

-- Сообщения: читают участники обращения и разработчики; отправитель всегда
-- auth.uid(), тип 'developer' — только для разработчика (дубль проверки в
-- триггере support_messages_guard). Обновлять сообщения нельзя никому,
-- кроме read_at у разработчика (неизменяемость тела — триггер).
DROP POLICY IF EXISTS "support_messages_select" ON public.support_messages;
CREATE POLICY "support_messages_select" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    public.is_support_developer()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "support_messages_insert" ON public.support_messages;
CREATE POLICY "support_messages_insert" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (message_type = 'user' OR public.is_support_developer())
    AND (
      public.is_support_developer()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "support_messages_update" ON public.support_messages;
CREATE POLICY "support_messages_update" ON public.support_messages
  FOR UPDATE TO authenticated
  USING (public.is_support_developer())
  WITH CHECK (public.is_support_developer());

-- Внутренние заметки: у пользователей НЕТ ни одной политики → SELECT вернёт
-- пусто, INSERT/UPDATE запрещены. Только разработчики.
DROP POLICY IF EXISTS "developer_notes_select" ON public.developer_notes;
CREATE POLICY "developer_notes_select" ON public.developer_notes
  FOR SELECT TO authenticated
  USING (public.is_support_developer());

DROP POLICY IF EXISTS "developer_notes_insert" ON public.developer_notes;
CREATE POLICY "developer_notes_insert" ON public.developer_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_support_developer() AND developer_id = auth.uid());

DROP POLICY IF EXISTS "developer_notes_update" ON public.developer_notes;
CREATE POLICY "developer_notes_update" ON public.developer_notes
  FOR UPDATE TO authenticated
  USING (public.is_support_developer())
  WITH CHECK (public.is_support_developer());

-- Файлы обращений: строку пишут RPC (см. ниже) или участник обращения;
-- читают участники и разработчики. Файл проверяется сервером (is_valid_photo).
DROP POLICY IF EXISTS "ticket_photos_select" ON public.ticket_photos;
CREATE POLICY "ticket_photos_select" ON public.ticket_photos
  FOR SELECT TO authenticated
  USING (
    public.is_support_developer()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ticket_photos_insert" ON public.ticket_photos;
CREATE POLICY "ticket_photos_insert" ON public.ticket_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND public.is_valid_photo('support-photos', storage_path, auth.uid())
    AND (
      public.is_support_developer()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "ticket_photos_delete" ON public.ticket_photos;
CREATE POLICY "ticket_photos_delete" ON public.ticket_photos
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_support_developer());

-- ─── 4. Файлы: buckets и политики Storage ────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-photos', 'community-photos', true,
  5242880, -- 5MB — предел проекта для фото сообщества
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-photos', 'support-photos', false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- community-photos: запись/удаление — только в свою папку; чтение публичное
-- (public bucket, фото опубликованных постов).
DROP POLICY IF EXISTS "community_photos_insert" ON storage.objects;
CREATE POLICY "community_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "community_photos_delete" ON storage.objects;
CREATE POLICY "community_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'community-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- support-photos: приватный bucket. Читать может автор файлов (папка
-- auth.uid()) и разработчики — временные подписанные ссылки выдаются только
-- им; посторонним путь не помогает (RLS на storage.objects).
DROP POLICY IF EXISTS "support_photos_select" ON storage.objects;
CREATE POLICY "support_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support-photos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_support_developer())
  );

DROP POLICY IF EXISTS "support_photos_insert" ON storage.objects;
CREATE POLICY "support_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "support_photos_delete" ON storage.objects;
CREATE POLICY "support_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'support-photos'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_support_developer())
  );

-- ─── 5. Триггеры ─────────────────────────────────────────────────────────────

-- updated_at (общая функция проекта из complete_schema).
DROP TRIGGER IF EXISTS trg_community_posts_updated_at ON public.community_posts;
CREATE TRIGGER trg_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_community_comments_updated_at ON public.community_comments;
CREATE TRIGGER trg_community_comments_updated_at
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Защита обращений: пользователь их не обновляет вообще (нет политики),
-- триггер страхует серверные инварианты для всех, включая разработчика.
CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Обращение нельзя перепривязать';
    END IF;
    IF NEW.assigned_developer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.support_developers WHERE user_id = NEW.assigned_developer_id) THEN
      RAISE EXCEPTION 'Ответственный должен быть разработчиком';
    END IF;
    IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
      NEW.closed_at := coalesce(NEW.closed_at, now());
    ELSIF NEW.status <> 'closed' THEN
      NEW.closed_at := NULL;
    END IF;
  ELSE
    IF NEW.assigned_developer_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.support_developers WHERE user_id = NEW.assigned_developer_id) THEN
      RAISE EXCEPTION 'Ответственный должен быть разработчиком';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_guard ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_guard
  BEFORE INSERT OR UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_guard();

-- Сообщения: отправитель/участие/тип проверяются на сервере (повтор RLS,
-- но уже в не-RLS-слое), тело сообщения неизменяемо — правится только read_at.
CREATE OR REPLACE FUNCTION public.support_messages_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.sender_id IS NULL OR NEW.sender_id <> auth.uid() THEN
      RAISE EXCEPTION 'Отправитель определяется сервером';
    END IF;
    IF NEW.message_type <> 'user' AND NOT public.is_support_developer() THEN
      RAISE EXCEPTION 'Тип сообщения определяется сервером';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = NEW.ticket_id
        AND (t.user_id = auth.uid() OR public.is_support_developer())
    ) THEN
      RAISE EXCEPTION 'Нет доступа к обращению';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.ticket_id    IS DISTINCT FROM OLD.ticket_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.message_type IS DISTINCT FROM OLD.message_type
     OR NEW.body      IS DISTINCT FROM OLD.body
     OR NEW.client_msg_id IS DISTINCT FROM OLD.client_msg_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Сообщения неизменяемы';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_messages_guard ON public.support_messages;
CREATE TRIGGER trg_support_messages_guard
  BEFORE INSERT OR UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_messages_guard();

-- Лимит фото: не больше 4 на публикацию (серверная проверка количества,
-- конфигурация проекта — src/lib/supportConfig.js PHOTO_LIMITS.maxCount).
CREATE OR REPLACE FUNCTION public.community_photos_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT count(*) FROM public.community_photos WHERE post_id = NEW.post_id) >= 4 THEN
    RAISE EXCEPTION 'Не больше 4 фотографий на публикацию';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_photos_limit ON public.community_photos;
CREATE TRIGGER trg_community_photos_limit
  BEFORE INSERT ON public.community_photos
  FOR EACH ROW EXECUTE FUNCTION public.community_photos_limit();

-- ─── 6. Уведомления (существующая таблица notifications + Realtime) ──────────

-- Ответ разработчика → автору обращения (без текста сообщения: приватное
-- содержимое в уведомления не попадает, только номер обращения).
CREATE OR REPLACE FUNCTION public.notify_on_support_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ticket public.support_tickets%ROWTYPE;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;

  IF NEW.message_type = 'developer' THEN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      v_ticket.user_id,
      'Ответ разработчиков · обращение #' || v_ticket.ticket_number,
      'Разработчики ответили на ваше обращение',
      'support',
      jsonb_build_object('ticket_id', NEW.ticket_id, 'url', '/reviews')
    );
  ELSIF NEW.message_type = 'user' AND v_ticket.assigned_developer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      v_ticket.assigned_developer_id,
      'Новый ответ · обращение #' || v_ticket.ticket_number,
      'Пользователь ответил в обращении',
      'support',
      jsonb_build_object('ticket_id', NEW.ticket_id, 'url', '/support/developer')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_support_message ON public.support_messages;
CREATE TRIGGER trg_notify_on_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_support_message();

-- Смена статуса обращения → автору (только факт, без содержимого).
CREATE OR REPLACE FUNCTION public.notify_on_ticket_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      NEW.user_id,
      'Обращение #' || NEW.ticket_number || ' · статус',
      'Статус вашего обращения изменён: ' ||
      CASE NEW.status
        WHEN 'new' THEN 'Новое'
        WHEN 'in_progress' THEN 'В работе'
        WHEN 'awaiting_user' THEN 'Ожидает ответа пользователя'
        WHEN 'resolved' THEN 'Решено'
        WHEN 'closed' THEN 'Закрыто'
        ELSE NEW.status
      END,
      'support',
      jsonb_build_object('ticket_id', NEW.id, 'status', NEW.status, 'url', '/reviews')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_ticket_status ON public.support_tickets;
CREATE TRIGGER trg_notify_on_ticket_status
  AFTER UPDATE OF status ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_ticket_status();

-- Ответ в обсуждении → автору поста (комментарии публичные, превью 120
-- символов допустимо; приватных данных нет).
CREATE OR REPLACE FUNCTION public.notify_on_community_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_post public.community_posts%ROWTYPE;
BEGIN
  SELECT * INTO v_post FROM public.community_posts WHERE id = NEW.post_id;
  IF FOUND AND v_post.author_id <> NEW.author_id AND v_post.status = 'published' THEN
    INSERT INTO public.notifications (user_id, title, body, type, data)
    VALUES (
      v_post.author_id,
      'Новый ответ к вашей публикации',
      left(NEW.body, 120),
      'community',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'url', '/reviews')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_community_comment ON public.community_comments;
CREATE TRIGGER trg_notify_on_community_comment
  AFTER INSERT ON public.community_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_community_comment();

-- ─── 7. RPC: атомарное создание обращения и ответ в нём ─────────────────────

-- Создание обращения: валидация → обращение → первое сообщение → фото.
-- Идемпотентность: повтор с тем же client_msg_id возвращает уже созданное
-- обращение (уникальный индекс ux_support_tickets_client_msg), а не дубль.
CREATE OR REPLACE FUNCTION public.support_create_ticket(
  p_subject      TEXT,
  p_category     TEXT,
  p_body         TEXT,
  p_photos       JSONB DEFAULT '[]'::jsonb,
  p_client_msg_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_ticket  UUID;
  v_number  BIGINT;
  v_status  TEXT;
  v_photo   JSONB;
  v_path    TEXT;
  v_n       INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется войти в аккаунт';
  END IF;
  IF p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 3 AND 150 THEN
    RAISE EXCEPTION 'Тема обращения: от 3 до 150 символов';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 10 AND 4000 THEN
    RAISE EXCEPTION 'Описание: от 10 до 4000 символов';
  END IF;
  IF p_category IS NULL OR p_category NOT IN ('app_error', 'map_broken', 'wrong_route', 'taxi_issue', 'account_issue', 'idea', 'other') THEN
    RAISE EXCEPTION 'Недопустимая категория обращения';
  END IF;

  v_n := coalesce(jsonb_array_length(p_photos), 0);
  IF v_n NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'Не больше 4 фотографий';
  END IF;
  IF p_client_msg_id IS NULL THEN
    RAISE EXCEPTION 'Повторная отправка защищена: нет client_msg_id';
  END IF;

  -- Все файлы проверяем до создания обращения: неудачная загрузка не
  -- оставляет «успешное» пустое обращение.
  FOR v_photo IN SELECT * FROM jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) LOOP
    v_path := v_photo ->> 'path';
    IF v_path IS NULL OR NOT public.is_valid_photo('support-photos', v_path, v_uid) THEN
      RAISE EXCEPTION 'Файл фотографии не прошёл проверку';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.support_tickets (user_id, category, subject, status, client_msg_id)
    VALUES (v_uid, p_category, btrim(p_subject), 'new', p_client_msg_id)
    RETURNING id, ticket_number, status INTO v_ticket, v_number, v_status;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, ticket_number, status INTO v_ticket, v_number, v_status
    FROM public.support_tickets
    WHERE user_id = v_uid AND client_msg_id = p_client_msg_id;
    RETURN jsonb_build_object(
      'id', v_ticket, 'ticket_number', v_number, 'status', v_status, 'duplicate', true
    );
  END;

  INSERT INTO public.support_messages (ticket_id, sender_id, message_type, body)
  VALUES (v_ticket, v_uid, 'user', btrim(p_body));

  FOR v_photo IN SELECT * FROM jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) LOOP
    v_path := v_photo ->> 'path';
    INSERT INTO public.ticket_photos (ticket_id, owner_id, storage_path, mime_type, size_bytes)
    SELECT v_ticket, v_uid, o.name,
           (o.metadata ->> 'mimetype')::text,
           (o.metadata ->> 'size')::int
    FROM storage.objects o
    WHERE o.bucket_id = 'support-photos' AND o.name = v_path;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_ticket, 'ticket_number', v_number, 'status', v_status, 'duplicate', false
  );
END;
$$;

-- Ответ в обращении (пользователь или разработчик): тип сообщения
-- определяется сервером по support_developers, а не клиентом. Повтор с тем
-- же client_msg_id не создаёт дубликат (ux_support_messages_client_msg).
CREATE OR REPLACE FUNCTION public.support_reply(
  p_ticket       UUID,
  p_body         TEXT,
  p_photos       JSONB DEFAULT '[]'::jsonb,
  p_client_msg_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_is_dev BOOLEAN := public.is_support_developer();
  v_ticket public.support_tickets%ROWTYPE;
  v_msg    UUID;
  v_photo  JSONB;
  v_path   TEXT;
  v_n      INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Требуется войти в аккаунт';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Сообщение: от 1 до 4000 символов';
  END IF;

  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = p_ticket;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Обращение не найдено';
  END IF;
  IF v_ticket.user_id <> v_uid AND NOT v_is_dev THEN
    RAISE EXCEPTION 'Нет доступа к обращению';
  END IF;

  v_n := coalesce(jsonb_array_length(p_photos), 0);
  IF v_n NOT BETWEEN 0 AND 4 THEN
    RAISE EXCEPTION 'Не больше 4 фотографий';
  END IF;
  IF p_client_msg_id IS NULL THEN
    RAISE EXCEPTION 'Повторная отправка защищена: нет client_msg_id';
  END IF;

  FOR v_photo IN SELECT * FROM jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) LOOP
    v_path := v_photo ->> 'path';
    IF v_path IS NULL OR NOT public.is_valid_photo('support-photos', v_path, v_uid) THEN
      RAISE EXCEPTION 'Файл фотографии не прошёл проверку';
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.support_messages (ticket_id, sender_id, message_type, body, client_msg_id)
    VALUES (
      p_ticket,
      v_uid,
      CASE WHEN v_is_dev THEN 'developer' ELSE 'user' END,
      btrim(p_body),
      p_client_msg_id
    )
    RETURNING id INTO v_msg;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_msg
    FROM public.support_messages
    WHERE ticket_id = p_ticket AND sender_id = v_uid AND client_msg_id = p_client_msg_id;
    RETURN jsonb_build_object('message_id', v_msg, 'duplicate', true);
  END;

  FOR v_photo IN SELECT * FROM jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) LOOP
    v_path := v_photo ->> 'path';
    INSERT INTO public.ticket_photos (ticket_id, message_id, owner_id, storage_path, mime_type, size_bytes)
    SELECT p_ticket, v_msg, v_uid, o.name,
           (o.metadata ->> 'mimetype')::text,
           (o.metadata ->> 'size')::int
    FROM storage.objects o
    WHERE o.bucket_id = 'support-photos' AND o.name = v_path;
  END LOOP;

  -- Ответ пользователя на «Ожидает ответа пользователя» → снова в работе.
  IF NOT v_is_dev AND v_ticket.status = 'awaiting_user' THEN
    UPDATE public.support_tickets
    SET status = 'in_progress', updated_at = now()
    WHERE id = p_ticket;
  ELSE
    UPDATE public.support_tickets SET updated_at = now() WHERE id = p_ticket;
  END IF;

  RETURN jsonb_build_object('message_id', v_msg, 'duplicate', false);
END;
$$;

-- Прочитано: пользователь помечает только ответы разработчиков в СВОИХ
-- обращениях (вызывается вместо прямого UPDATE, которому у него нет политики).
CREATE OR REPLACE FUNCTION public.support_mark_read(p_ticket UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE public.support_messages m
  SET read_at = now()
  WHERE m.ticket_id = p_ticket
    AND m.message_type = 'developer'
    AND m.read_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = p_ticket AND t.user_id = auth.uid()
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ─── 8. Realtime: открытые диалоги и панель обновляются без перезагрузки ─────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 9. PostgREST: перечитать схему ──────────────────────────────────────────
SELECT pg_notify('pgrst', 'reload schema');
