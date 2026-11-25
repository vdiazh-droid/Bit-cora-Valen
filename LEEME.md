# Mi bitácora · app web

La misma bitácora que tenías como artifact en Claude, ahora como app web:
- **GitHub Pages** muestra la página (gratis).
- **Supabase** guarda tus datos, sincroniza el celular y el computador, y deja conectar otras apps (gratis).

Tu dirección va a ser: **https://vdiazh-droid.github.io/bitacora/**

> **No subas `respaldo-bitacora.json` a GitHub.** Tiene tus datos personales y el repositorio es público. Ese archivo solo se carga desde la app (paso 7).

---

## Paso 1 · Crear la base de datos (Supabase) — 5 min
1. Entra a **https://supabase.com** → *Start your project* → regístrate (puedes usar tu cuenta de GitHub).
2. **New project**:
   - Name: `bitacora`
   - Database Password: toca *Generate a password* y guárdala en un lugar seguro (casi nunca la vas a necesitar).
   - Region: *South America (São Paulo)*.
   - Toca **Create new project** y espera 1 o 2 minutos.
3. En el menú de la izquierda: **SQL Editor** → **New query**.
4. Abre el archivo `supabase/esquema.sql`, copia **todo** su contenido, pégalo y toca **Run**. Debe aparecer *Success. No rows returned*.

## Paso 2 · Copiar tus dos datos de conexión — 1 min
1. En Supabase: ⚙️ **Project Settings** → **API Keys** (o *Data API*).
2. Copia en una nota:
   - **Project URL**: algo como `https://abcdxyz.supabase.co` (también aparece en *Project Settings → Data API*).
   - La llave **anon public**, un texto largo que empieza por `eyJ…`. Si no la ves, abre la pestaña **Legacy API Keys**.

## Paso 3 · Preparar el inicio de sesión — 1 min
1. En Supabase: **Authentication** → **Sign In / Providers** → **Email**.
2. Desactiva **Confirm email** → *Save*. (Así tu cuenta funciona de inmediato, sin esperar correos.)
3. Deja activado **Allow new users to sign up** por ahora; lo cierras en el paso 7.

## Paso 4 · Subir la app a GitHub — 5 min
1. Descomprime `bitacora-para-github.zip` en tu computador.
2. Entra a **https://github.com/new**:
   - Repository name: `bitacora`
   - Marca **Public**.
   - Toca **Create repository**.
3. En la página que aparece, toca el enlace **uploading an existing file**.
4. Arrastra **todo lo que hay dentro** de la carpeta descomprimida (los archivos y la carpeta `supabase`), no la carpeta misma. Abajo toca **Commit changes**.

## Paso 5 · Poner tus datos de conexión — 2 min
1. En tu repositorio de GitHub, abre el archivo **`config.js`** y toca el lápiz ✏️ (*Edit*).
2. Reemplaza:
   - `https://TU-PROYECTO.supabase.co` por tu **Project URL**,
   - `TU_LLAVE_ANON_PUBLICA` por tu llave **anon public**.

   Deja las comillas. Ejemplo: `SUPABASE_URL: 'https://abcdxyz.supabase.co',`
3. Toca **Commit changes…** → **Commit changes**.

## Paso 6 · Encender la página — 2 min
1. En el repositorio: **Settings** → **Pages** (menú izquierdo).
2. En *Build and deployment* → Source: **Deploy from a branch**. Branch: **main** y carpeta **/ (root)** → **Save**.
3. Espera 1 o 2 minutos y recarga: arriba aparece *Your site is live at* **https://vdiazh-droid.github.io/bitacora/**.
4. De vuelta en Supabase: **Authentication** → **URL Configuration**:
   - **Site URL**: `https://vdiazh-droid.github.io/bitacora/` → *Save*.
   - **Redirect URLs** → *Add URL*: `https://vdiazh-droid.github.io/bitacora/**` → *Save*.

## Paso 7 · Entrar y traer tus datos (en el computador)
1. Abre **https://vdiazh-droid.github.io/bitacora/**.
2. Escribe tu correo y una contraseña nueva (mínimo 8 caracteres) y toca **Es mi primera vez: crear mi cuenta**. Entras de inmediato.
3. Arriba a la derecha toca **Ajustes** → **Cargar respaldo** → elige `respaldo-bitacora.json`. Debe decir *Listo: se cargaron 29 registros*.
4. **Cierra la puerta** para que nadie más cree cuenta: en Supabase → **Authentication** → **Sign In / Providers** (o *Providers → Email*) → desactiva **Allow new users to sign up** → *Save*.

## Paso 8 · Instalarla en el celular
**iPhone**
1. Abre la dirección en **Safari**.
2. Toca el botón Compartir (cuadrado con flecha) → **Agregar a pantalla de inicio** → *Agregar*.
3. Abre la app desde el ícono nuevo y entra con tu correo y tu contraseña.

**Android**
1. Abre la dirección en **Chrome**.
2. Menú ⋮ → **Agregar a pantalla principal** o **Instalar app**.
3. Ábrela y entra con tu correo y tu contraseña.

Listo: lo que anotes en el celular aparece en el computador y al revés.

---

## Si algo no funciona
| Qué ves | Qué hacer |
|---|---|
| «Falta configurar la conexión» | Revisa el paso 5: la dirección y la llave en `config.js`, con comillas. |
| «Correo o contraseña incorrectos» | Revisa mayúsculas. Si la olvidaste, toca «Olvidé mi contraseña» y abre el enlace del correo en el navegador (no en la app instalada). |
| «Tu correo aún no está confirmado» | Revisa el paso 3: desactiva *Confirm email*. |
| La página muestra 404 | Espera 2 minutos después del paso 6 y revisa que `index.html` esté en la raíz del repositorio. |
| Cambié algo y no se ve | GitHub tarda 1 o 2 minutos en publicar. Recarga. |

---

## Conectar otras apps

1. En la app: **Ajustes → Conectar otras apps** → ponle un nombre (ej. *Atajos iPhone*) → **Crear llave**. Una llave por app; si una se filtra, bórrala ahí.
2. Toda petición va a `https://TU-PROYECTO.supabase.co/rest/v1/rpc/<función>`, método **POST**, con encabezados:
   - `apikey: <tu llave anon public>`
   - `Content-Type: application/json`

| Función | Para qué | Cuerpo (JSON) |
|---|---|---|
| `bitacora_tarea` | Agregar una tarea | `{"llave":"…","titulo":"Enviar portafolio","fecha":"2026-12-01"}` (fecha opcional) |
| `bitacora_gasto` | Anotar un gasto | `{"llave":"…","monto":25000,"categoria":"Rollos","nota":"Kodak 400"}` (sin fecha usa hoy en Bogotá) |
| `bitacora_habito` | Marcar un hábito | `{"llave":"…","habito":"med","valor":"full","minutos":10}` |
| `bitacora_leer` | Leer datos | `{"llave":"…","coleccion":"items"}` (sin colección trae todo) |
| `bitacora_guardar` | Crear o cambiar cualquier documento | `{"llave":"…","coleccion":"items","datos":{"kind":"idea","title":"…","type":"Proyecto"}}` |
| `bitacora_borrar` | Borrar un documento | `{"llave":"…","coleccion":"items","doc_id":"…"}` |

- **Hábitos**: `ej` ejercicio, `med` meditación, `esc` escritura, `cel` sin celular, `foto` fotografía, `est` estudio, `emp` empleo, `cie` cierre del día, `yoga`, `lit` literatura. Valor: `"full"` completo, `"min"` mínimo, `""` desmarcar.
- **Categorías de gasto**: Mercado, Transporte, Hogar, Salud, Salidas y comida, Ropa, Regalos, Otro personal · Rollos, Revelado, Escaneo, Impresiones, Inscripciones, Equipo, Otro fotografía.

**Atajos de iPhone (ej. «Anotar gasto»)**: *Pedir entrada* (número) → *Elegir de la lista* (categorías) → *Obtener contenido de URL* con la URL de `bitacora_gasto`, método POST, los dos encabezados y cuerpo JSON con `llave`, `monto` y `categoria`.

**Zapier / Make / n8n**: paso *Webhooks → POST* (Zapier: *Webhooks by Zapier → Custom Request*; Make: *HTTP → Make a request*; n8n: *HTTP Request*) con la URL, los encabezados y el cuerpo de la tabla.

**Google Sheets (Apps Script)**
```js
function leerGastos() {
  const r = UrlFetchApp.fetch('https://TU-PROYECTO.supabase.co/rest/v1/rpc/bitacora_leer', {
    method: 'post', contentType: 'application/json',
    headers: { apikey: 'TU_LLAVE_ANON_PUBLICA' },
    payload: JSON.stringify({ llave: 'TU_LLAVE_DE_APP', coleccion: 'gastos' })
  });
  const filas = JSON.parse(r.getContentText()).map(d => [d.datos.date, d.datos.cat, d.datos.amount, d.datos.note]);
  const hoja = SpreadsheetApp.getActiveSheet();
  hoja.clear(); hoja.appendRow(['Fecha', 'Categoría', 'Monto', 'Nota']);
  if (filas.length) hoja.getRange(2, 1, filas.length, 4).setValues(filas);
}
```

## Bueno saber
- **Respaldo**: *Ajustes → Descargar con imágenes* de vez en cuando (el plan gratis de Supabase no hace copias automáticas).
- Si el proyecto pasa una semana sin uso, Supabase lo pausa; se reactiva con un clic en su panel y no se pierde nada.
