# Finanzas Familiares

App web instalable (PWA) para llevar el control de deudas, cuotas, créditos, gastos e ingresos.
**Tus datos viven en tu propio proyecto de Supabase** (Postgres + Auth + Storage) — no en un
servidor de terceros ni en la nube de nadie más — y se sincronizan entre todos tus dispositivos
(iPhone, computador, tablet) con la misma cuenta. **Necesita internet para funcionar.**

Publicada en: **https://holbaph.github.io/finanzas-familiares/**

## Qué incluye

- **Cuenta compartida por hogar**: inicias sesión con correo y contraseña (las cuentas se crean
  tú mismo desde el panel de Supabase, no hay registro público). Cualquiera con una cuenta ve y
  edita los mismos datos — pensado para una familia, no para separar información por persona.
- **Bloqueo local con PIN (4 dígitos) y/o Face ID / Touch ID**: una segunda capa, aparte del
  login, para que nadie que tome el teléfono (con la sesión ya iniciada) entre a la app. El PIN
  se autodesbloquea al escribir el último dígito; Face ID se intenta solo al abrir. Si lo
  olvidas, hay una opción en la pantalla de bloqueo para quitarlo **sin tocar tus datos**
  (viven en la nube, no en el PIN).
  - **Tiempo de gracia**: en Ajustes → Seguridad eliges cuánto debe pasar desde que sales de la
    app para que vuelva a pedir acceso — Inmediatamente, 30 segundos, 1 minuto (por defecto), 5
    o 15 minutos. Igual en iPhone, computador o tablet.
- **Resumen del mes**: ingresos, gastos comprometidos, balance disponible, pendiente por pagar,
  progreso de pagos y desglose por empresa.
- **Deudas**: agrupadas por empresa (la empresa hace de categoría), con ícono a elección, tipo
  "gasto recurrente" (agua, luz, suscripciones...) o "crédito en cuotas" (con N° total de
  cuotas, cuotas pagadas y por pagar, barra de progreso). Al marcar una cuota como pagada, el
  acumulado avanza solo y detecta automáticamente cuándo un crédito queda "Completa".
  - **Archivar / pagadas**: cualquier deuda se puede archivar (cuenta cerrada o saldada) sin
    perder su historial, con la fecha en que se archivó.
  - **Empresas como maestro**: se eligen desde una lista y se administran desde Ajustes →
    Empresas (agregar, renombrar, quitar).
  - **Foto (boleta, producto, contrato...)**: opcional, tocable para verla ampliada.
  - Totales por empresa: al filtrar aparece cuánto debes a esa empresa; sin filtro, cada grupo
    ya muestra su propio total.
- **Gastos → Consumo propio**: gastos del día a día, por categoría (comida, transporte, etc.).
- **Gastos → Por rendir a la empresa**: gastos que pagas tú y le rendirás cuentas a tu trabajo,
  con foto de la boleta, estados **Pendiente → Rendido → Reembolsado**, y foto del comprobante
  bancario del reembolso.
- **Ingresos**: por fuente (sueldo, bono, etc.), fijos o variables, por mes.
- **Temas**: Automático, Claro, Oscuro, Rosa, Rosa Noche y Lavanda, en Ajustes → Apariencia.
- **Cierre de mes**: calcula lo que sobró (nunca negativo) y lo traslada como saldo inicial del
  mes siguiente; se puede ajustar a mano, recalcular o deshacer.
- **Informe en Excel**: Ajustes → Exportar informe a Excel genera un `.xlsx` real con todo
  (Resumen Mensual, Deudas, Historial de Pagos, Ingresos, Gastos), solo para revisar/analizar.
- **Respaldo `.json`**: exporta/importa un archivo con todos tus datos (excepto fotos) como
  copia de seguridad extra, además de la nube.

## Configurar Supabase (una sola vez)

La app necesita un proyecto de Supabase propio para guardar los datos. Yo no puedo crearlo por
ti (requiere tu cuenta), pero dejé todo listo para que sea rápido:

1. Crea una cuenta gratis en **https://supabase.com** y un proyecto nuevo.
2. Ve a **SQL Editor → New query**, pega el contenido completo de
   [`supabase/schema.sql`](supabase/schema.sql) y presiona **Run**. Esto crea todas las tablas,
   los permisos (RLS) y el espacio para fotos.
3. Ve a **Authentication → Users → Add user** y crea una cuenta para ti (y otra para tu pareja,
   si van a compartir la app), con correo y contraseña. No actives el registro público — no
   hace falta, las cuentas se crean solo desde aquí.
4. Ve a **Project Settings → API** y copia la **Project URL** y la **anon public key**.
5. Abre [`js/supabase-config.js`](js/supabase-config.js) y reemplaza `SUPABASE_URL` y
   `SUPABASE_ANON_KEY` con esos dos valores. Guarda y sube el cambio (`git add`, `git commit`,
   `git push`) para que quede publicado.

Esos dos valores son públicos por diseño (los usa cualquiera que abra la app en su navegador);
la seguridad real la dan las políticas de la base de datos (RLS) del script SQL — sin haber
iniciado sesión, esas claves no permiten leer ni escribir nada.

## ⚠️ Importante: usa siempre el ícono de la pantalla de inicio

Entra siempre por el ícono que agregaste a tu pantalla de inicio, no por una pestaña de Safari
suelta — evita confusiones de sesión entre distintos contextos del navegador.

## Cómo instalarla en tu iPhone

1. Abre **Safari** (tiene que ser Safari, no Chrome) y entra a:

   ```
   https://holbaph.github.io/finanzas-familiares/
   ```

2. Inicia sesión con el correo y contraseña que creaste en Supabase.
3. Toca el botón compartir (el cuadrado con la flecha hacia arriba) y elige
   **"Agregar a pantalla de inicio"**.
4. Abre la app **desde ese ícono** — se ve a pantalla completa, como una app nativa. Necesitas
   internet cada vez que la uses (los datos viven en Supabase, no en el teléfono).

En un computador o tablet, el mismo enlace y la misma cuenta muestran exactamente los mismos
datos — no hace falta reinstalar nada especial, solo abrir la URL e iniciar sesión.

## Respaldar tus datos

Aparte de que los datos ya viven en Supabase (con su propio respaldo en la nube), puedes exportar
una copia adicional: Ajustes → Exportar respaldo (`.json`). Sirve para tener una copia portátil
o para revisar datos sin conexión a Supabase; para restaurar del todo, Ajustes → Importar
respaldo vuelve a subir esos datos a la nube. Ajustes muestra el nombre y fecha del último
respaldo exportado o importado. Este archivo **no incluye las fotos** (viven en Supabase
Storage), y el PIN/Face ID que guarda son solo para *este* dispositivo, no se comparten.

## Estructura del proyecto

```
index.html               Estructura de la app (login, bloqueo, vistas)
css/styles.css            Estilos (temas claro/oscuro/rosa/lavanda, diseño tipo iOS)
js/supabase-config.js      URL y anon key de TU proyecto de Supabase (editar acá)
js/auth.js                 Login/logout con Supabase Auth
js/core.js                 Caché en memoria + sincronización con Supabase (deudas, pagos,
                            ingresos, gastos, empresas, cierres); "meta" queda local
js/photos.js                Fotos (boletas/comprobantes/deudas) en Supabase Storage
js/lock.js                  Bloqueo local con PIN/Face ID (hash SHA-256, nunca texto plano)
js/xlsx-writer.js            Generador de archivos .xlsx desde cero (sin librerías externas)
js/app.js                   Lógica de la interfaz, navegación, arranque (login → carga → app)
manifest.json                Metadatos de instalación (PWA)
sw.js                        Service Worker (cachea el cascarón estático, no los datos)
supabase/schema.sql           Esquema completo para pegar en el SQL Editor de tu proyecto
icons/                       Íconos de la app
```
