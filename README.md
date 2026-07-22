# Finanzas Familiares

App web instalable (PWA) para llevar el control de deudas, cuotas, créditos, gastos e ingresos.
**Funciona 100% offline y todos los datos quedan guardados solo en tu iPhone** (localStorage +
IndexedDB para fotos) — no hay backend, no hay nube, no hay cuentas.

Publicada en: **https://holbaph.github.io/finanzas-familiares/**

## Qué incluye

- **Resumen del mes**: ingresos, gastos comprometidos, balance disponible, pendiente por pagar,
  progreso de pagos y desglose por empresa.
- **Deudas**: agrupadas por empresa (la empresa hace de categoría — no hay un campo aparte para
  eso), con ícono a elección, tipo "gasto recurrente" (agua, luz, suscripciones...) o "crédito en
  cuotas" (con N° total de cuotas, cuotas pagadas y por pagar, barra de progreso). Al marcar una
  cuota como pagada, el acumulado avanza solo y detecta automáticamente cuándo un crédito queda
  "Completa".
  - **Archivar / pagadas**: cualquier deuda se puede archivar (cuenta cerrada o saldada) sin
    perder su historial. Las activas son las únicas que aparecen en la lista principal; las
    archivadas se ven aparte en "Archivadas / pagadas", con la fecha en que se archivaron y el
    historial completo de pagos (con fecha de cada pago).
  - **Empresas como maestro**: se eligen desde una lista (no hay que escribirlas de nuevo cada
    vez) y se administran desde Ajustes → Empresas, donde se pueden agregar, renombrar (renombra
    también todas las deudas que ya la usaban) o quitar.
  - **Foto (boleta, producto, contrato...)**: opcional, al crear o editar una deuda. Se ve como
    miniatura en la tarjeta y en el detalle, y se puede tocar para verla ampliada.
  - Al filtrar Deudas por una empresa, arriba de la lista aparece cuántas deudas tienes con ella
    y el total a pagar ese mes entre todas.
- **Gastos → Consumo propio**: gastos del día a día, por categoría (comida, transporte, etc.).
- **Gastos → Por rendir a la empresa**: gastos que pagas tú y le rendirás cuentas a tu trabajo.
  Cada uno tiene:
  - **Foto de la boleta** (cámara o galería) como respaldo de lo consumido.
  - Estados **Pendiente → Rendido → Reembolsado**, para saber qué ya entregaste a la empresa
    y qué todavía te deben.
  - **Foto del comprobante bancario** (el retiro que hiciste o el depósito que te hizo la
    empresa) para dejar registro de cuándo se cerró cada rendición.
  Las fotos se guardan comprimidas en el propio teléfono (IndexedDB) — nunca se suben a
  ningún servidor. Cualquier foto (boleta o comprobante) se puede tocar para verla en
  pantalla completa y revisar el detalle.
- **Ingresos**: por fuente (sueldo, bono, etc.), fijos o variables, por mes.
- **Bloqueo con PIN (4 dígitos) y/o Face ID / Touch ID**: para que nadie más abra la app desde
  el teléfono. El PIN se autodesbloquea al escribir el último dígito; si activas Face ID/Touch
  ID, se intenta automáticamente al abrir. La app se vuelve a bloquear sola cada vez que se
  oculta/cierra. Si no puedes ingresar, hay una opción en la misma pantalla de bloqueo para
  borrar todo y empezar de nuevo (es la única forma de recuperar el acceso, ya que ni el PIN
  ni los datos de Face ID se guardan en texto plano ni se pueden leer).
- **Temas**: Automático, Claro, Oscuro, Rosa, Rosa Noche y Lavanda, en Ajustes → Apariencia.
- **Navegación por mes**: al pasar a un mes nuevo, la app genera automáticamente el gasto
  esperado de cada deuda activa (igual que arrastrar las columnas de tu planilla).
- **Cierre de mes**: desde el Resumen, botón "Cerrar [mes]" — calcula lo que sobró (ingresos
  menos gastos, nunca negativo) y lo traslada como saldo inicial del mes siguiente. Si no sobró
  nada, el mes siguiente simplemente parte en $0 hasta que llegue el próximo ingreso. Se puede
  recalcular o deshacer en cualquier momento. La app recuerda cerrar el mes anterior mientras
  estés entre los días 1 y 5 del mes en curso.
- **Informe en Excel**: Ajustes → Exportar informe a Excel genera un `.xlsx` real (con hojas
  Resumen Mensual, Deudas, Historial de Pagos, Ingresos, Gastos - Consumo y Gastos - Por Rendir)
  para revisar y analizar todo fuera de la app. Se genera enteramente en el teléfono, sin
  ninguna librería externa ni conexión — es solo para lectura, no reemplaza al respaldo `.json`
  (ese sí se puede volver a importar a la app).
- **Ajustes**: exportar/importar un respaldo en `.json`, y borrar todos los datos.

Un dispositivo nuevo (o recién reinstalado) arranca **completamente vacío** — sin deudas,
ingresos ni gastos de ejemplo — listo para que cargues lo tuyo o importes un respaldo.

> Nota sobre el respaldo: el archivo `.json` que exportas desde Ajustes guarda deudas, ingresos,
> gastos, el tema/mes elegido y la configuración del PIN — **todo excepto las fotos**, que viven
> aparte en IndexedDB para no hacer gigante el archivo. Si cambias de teléfono, revisa que las
> fotos importantes sigan disponibles (o guárdalas por separado) antes de borrar datos del
> dispositivo anterior.

## ⚠️ Importante: usa siempre el ícono de la pantalla de inicio

Para evitar que el teléfono guarde tus datos en dos lugares distintos (que es lo que hace parecer
que "se perdieron" cosas), **entra siempre por el ícono que agregaste a tu pantalla de inicio**,
nunca por una pestaña de Safari o un buscador. Si tienes pestañas de Safari abiertas con la URL
de la app, ciérralas — son una copia visualmente idéntica pero pueden comportarse como un
contexto distinto en algunas versiones de iOS.

## Cómo instalarla en tu iPhone

1. Abre **Safari** (tiene que ser Safari, no Chrome) y entra a:

   ```
   https://holbaph.github.io/finanzas-familiares/
   ```

2. Toca el botón compartir (el cuadrado con la flecha hacia arriba) y elige
   **"Agregar a pantalla de inicio"**.

3. Abre la app **desde ese ícono** (no desde Safari) — se abre a pantalla completa, como una
   app nativa. A partir de ahí funciona 100% sin conexión, sin importar en qué red estés ni si
   tu computador está prendido o no.

Esta publicación en GitHub Pages es permanente (no vence ni depende de tu red o computador):
solo entrega los archivos de la app la primera vez, igual que una tienda de aplicaciones. Una
vez instalada, la app y tus datos son enteramente tuyos y locales.

## Respaldar tus datos

Ve a **Ajustes → Exportar respaldo** de vez en cuando y guarda el archivo `.json` (por ejemplo,
enviándotelo por AirDrop o correo). Si alguna vez cambias de teléfono o borras la app, puedes
recuperar todo con **Ajustes → Importar respaldo**. Ajustes muestra siempre el nombre y la fecha
del último respaldo exportado o importado, para tener esa referencia a mano.

> Nota: la app **no puede** recordar la ubicación de ese archivo en tu teléfono ni volver a leerlo
> sola al abrirse — Safari no permite que ninguna página web acceda al sistema de archivos por su
> cuenta, por seguridad. Esto no hace falta de todos modos: la app ya guarda todos tus datos por
> sí sola en el propio dispositivo (no necesitas importar el `.json` cada vez que la abres); el
> archivo es solo para respaldo o para pasar los datos a otro teléfono.

## Estructura del proyecto

```
index.html         Estructura de la app
css/styles.css      Estilos (temas claro/oscuro/rosa/lavanda, diseño tipo iOS)
js/core.js           Modelo de datos, localStorage, datos precargados de la planilla
js/photos.js         Almacenamiento de fotos (boletas/comprobantes) en IndexedDB
js/lock.js           Bloqueo con PIN (hash SHA-256, nunca texto plano)
js/xlsx-writer.js     Generador de archivos .xlsx desde cero (sin librerías externas)
js/app.js            Lógica de la interfaz, navegación y fix de viewport iOS
manifest.json         Metadatos de instalación (PWA)
sw.js                 Service Worker (cache offline)
icons/                Íconos de la app
```
