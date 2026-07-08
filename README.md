# Finanzas Familiares

App web instalable (PWA) para llevar el control de deudas, cuotas, créditos e ingresos.
**Funciona 100% offline y todos los datos quedan guardados solo en tu iPhone** (localStorage) —
no hay backend, no hay nube, no hay cuentas.

## Qué incluye

- **Resumen del mes**: ingresos, gastos comprometidos, balance disponible, pendiente por pagar,
  progreso de pagos y desglose por categoría.
- **Deudas**: agrupadas por categoría, con tipo "gasto recurrente" (agua, luz, suscripciones...)
  o "crédito en cuotas" (con N° total de cuotas, cuotas pagadas y por pagar, barra de progreso).
  Botón para marcar pagado/pendiente cada mes; al marcar una cuota como pagada, el acumulado
  avanza solo y detecta automáticamente cuándo un crédito queda "Completa".
- **Gastos → Consumo propio**: gastos del día a día, por categoría (comida, transporte, etc.).
- **Gastos → Por rendir a la empresa**: gastos que pagas tú y le rendirás cuentas a tu trabajo.
  Cada uno tiene:
  - **Foto de la boleta** (cámara o galería) como respaldo de lo consumido.
  - Estados **Pendiente → Rendido → Reembolsado**, para saber qué ya entregaste a la empresa
    y qué todavía te deben.
  - **Foto del comprobante bancario** (el retiro que hiciste o el depósito que te hizo la
    empresa) para dejar registro de cuándo se cerró cada rendición.
  Las fotos se guardan comprimidas en el propio teléfono (IndexedDB) — nunca se suben a
  ningún servidor.
- **Ingresos**: por fuente (sueldo, bono, etc.), fijos o variables, por mes.
- **Navegación por mes**: al pasar a un mes nuevo, la app genera automáticamente el gasto
  esperado de cada deuda activa (igual que arrastrar las columnas de tu planilla).
- **Ajustes**: exportar/importar un respaldo en `.json`, y borrar todos los datos.
- Ya viene precargada con los datos de tu planilla (Julio y Agosto 2026).

> Nota sobre el respaldo: el archivo `.json` que exportas desde Ajustes guarda deudas,
> ingresos y gastos, pero **no incluye las fotos** (viven aparte en IndexedDB para no hacer
> gigante el archivo). Si cambias de teléfono, primero copia igual las fotos importantes o
> revisa que sigan disponibles antes de borrar datos del dispositivo anterior.

## Cómo instalarla en tu iPhone (una sola vez)

Como es una app local sin servidor propio, necesitas "servirla" una vez desde tu computador para
que el iPhone la pueda abrir en Safari e instalarla. Después de instalada, **no necesitas volver
a prender el computador**: el Service Worker deja todo guardado en el teléfono.

1. En tu computador (Windows), abre una terminal en esta carpeta y ejecuta:

   ```
   python -m http.server 8765
   ```

   (Si no tienes Python, puedes usar `npx serve -l 8765` si tienes Node instalado.)

2. Verifica que tu iPhone esté conectado al **mismo Wi-Fi** que el computador.

3. Anota la IP de tu computador en esa red. Ahora mismo es: `10.10.11.137`
   (puede cambiar si te reconectas a otra red; para verla de nuevo en Windows usa `ipconfig`
   y busca "Dirección IPv4").

4. En el iPhone, abre **Safari** (tiene que ser Safari, no Chrome) y entra a:

   ```
   http://10.10.11.137:8765
   ```

5. Toca el botón compartir (el cuadrado con la flecha hacia arriba) y elige
   **"Agregar a pantalla de inicio"**.

6. Abre la app desde el ícono que quedó en tu pantalla de inicio — se abre a pantalla completa,
   como una app nativa. A partir de ahí funciona sin conexión, incluso si apagas el computador
   o te desconectas del Wi-Fi.

### Alternativa sin depender del computador

Si prefieres no tener que prender el PC nunca (ni siquiera la primera vez), puedes subir esta
misma carpeta tal cual a un hosting estático gratuito (por ejemplo GitHub Pages, Netlify o
Vercel) y abrir esa URL una vez desde el iPhone para instalarla. Es solo una forma de "entregar"
los archivos al teléfono — la app seguirá funcionando 100% offline y sin base de datos externa
una vez instalada, exactamente igual que con el método anterior.

## Respaldar tus datos

Ve a **Ajustes → Exportar respaldo** de vez en cuando y guarda el archivo `.json` (por ejemplo,
enviándotelo por AirDrop o correo). Si alguna vez cambias de teléfono o borras la app, puedes
recuperar todo con **Ajustes → Importar respaldo**.

## Estructura del proyecto

```
index.html          Estructura de la app
css/styles.css       Estilos (modo claro/oscuro, diseño tipo iOS)
js/core.js            Modelo de datos, localStorage, datos precargados de la planilla
js/app.js             Lógica de la interfaz y navegación
manifest.json          Metadatos de instalación (PWA)
sw.js                   Service Worker (cache offline)
icons/                  Íconos de la app
```
