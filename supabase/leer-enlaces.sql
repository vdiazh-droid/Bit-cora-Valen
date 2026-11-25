-- Bitácora · leer páginas de convocatorias
-- Permite que la app abra el enlace de una convocatoria y lea su contenido (gratis, sin IA).
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

create extension if not exists http with schema extensions;

create or replace function public.bitacora_leer_enlace(url text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r extensions.http_response;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para leer enlaces'; end if;
  if url !~* '^https?://[^/]+\.[^/]+' then raise exception 'Enlace inválido'; end if;
  if url ~* '^https?://(localhost|127\.|10\.|192\.168\.|169\.254\.|[^/]*supabase\.(co|in|net))' then raise exception 'Enlace no permitido'; end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  select * into r from extensions.http((
    'GET', url,
    array[extensions.http_header('User-Agent', 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36'),
          extensions.http_header('Accept-Language', 'es-CO,es;q=0.9,en;q=0.8')],
    null, null)::extensions.http_request);
  return jsonb_build_object('status', r.status, 'html', left(coalesce(r.content, ''), 800000));
end $$;

revoke all on function public.bitacora_leer_enlace(text) from public, anon;
grant execute on function public.bitacora_leer_enlace(text) to authenticated;
