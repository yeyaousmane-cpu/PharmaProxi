-- v053c — search_path figé pour convention_public_status (avis de sécurité Supabase).
alter function public.convention_public_status(text, date, date) set search_path to 'public';
