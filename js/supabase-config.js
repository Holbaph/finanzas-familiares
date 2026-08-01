// supabase-config.js — reemplaza estos dos valores con los de TU proyecto de Supabase:
// Project Settings → API → "Project URL" y "anon public" key.
//
// Estos dos valores son públicos por diseño (se usan desde el navegador de cualquiera
// que abra la app); la seguridad real la dan las políticas RLS del esquema
// (supabase/schema.sql) — sin haber iniciado sesión, esas claves no permiten leer ni
// escribir nada.
let SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
let SUPABASE_ANON_KEY = 'TU-ANON-KEY-AQUI';

let SUPABASE_CONFIGURADO = !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON-KEY');

let supabaseClient = SUPABASE_CONFIGURADO
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
