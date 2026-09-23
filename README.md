# GRUPO 22 — Content Manager

App web para gestionar el calendario editorial. El Google Sheet
**“Control de Contenido - RTC Grupo 22 TV”** es la base de datos: la app lee y escribe directo ahí.

## Correrla

```bash
npm install
cp .env.example .env.local   # pegar el Client ID (ver abajo)
npm run dev                  # http://localhost:3022
```

Sin Client ID la app muestra **datos de demostración**. Al conectar Google, se reemplazan por los datos reales.

## Configurar Google (una sola vez, ~5 minutos)

1. https://console.cloud.google.com → crear proyecto “Grupo 22 CM”.
2. **APIs y servicios → Biblioteca** → habilitar **Google Sheets API**.
3. **Pantalla de consentimiento OAuth** → Externo → agregar como *usuarios de prueba* los mails del equipo.
4. **Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web**.
   - Orígenes autorizados de JavaScript: `http://localhost:3022` (y la URL donde se publique, ej. `https://g22.vercel.app`).
5. Copiar el Client ID en `.env.local` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID=`) o pegarlo en **Configuración** dentro de la app.

Permiso que se pide: solo Google Sheets (`spreadsheets`). Cada persona entra con su cuenta y
necesita tener permiso de edición sobre el Sheet.

Publicarla para el equipo (web + celular): subir el repo a Vercel y agregar la variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

## Cómo usa el Sheet

| Pestaña | Uso |
|---|---|
| 📋 CONTENIDOS | Publicaciones activas. Lectura y escritura. Las nuevas se crean acá. |
| 🗄️ HISTÓRICO | Publicaciones migradas (G22-0001…). Se muestran y se pueden editar. |
| ⚙️ CONFIGURACIÓN | Marcas (emoji y color), estados, plataformas, tipos, prioridades y responsables. Solo lectura. |
| Dashboard, Calendario, Hoy, Agenda… | Vistas con fórmulas. La app **no las toca**. |
| `APP_HISTORIAL` | La crea la app en el primer cambio: timestamp, usuario, post_id, acción, campo, valor anterior y valor nuevo. |
| `APP_COMENTARIOS` | La crea la app en el primer comentario. |

Las pestañas se detectan por sus encabezados, no por la posición de las columnas.
En **Configuración** se ve la estructura detectada.

Reglas de escritura:
- Cada publicación se busca por su **ID**, nunca por el número de fila.
- Se escriben **solo las celdas que cambiaron**.
- Nunca se escriben las columnas con fórmula de CONTENIDOS (Día, Mes, Año, Semana, Inicio, Franja).
- Antes de guardar se relee la fila. Si alguien la cambió mientras tanto, la app no la pisa: muestra *“Esta publicación fue modificada por otro usuario. Actualizá los datos antes de guardar.”*
- Los IDs nuevos siguen el formato `G22-0055` y son únicos entre CONTENIDOS e HISTÓRICO.
- La app refresca los datos sola cada 45 segundos, al volver a la pestaña, y con el botón **↻ Actualizar**.
- Si Google no responde, los datos en pantalla se mantienen y se muestra un aviso.

⚠️ La fórmula “PRÓXIMO ID DISPONIBLE” de ⚙️ CONFIGURACIÓN solo mira CONTENIDOS (hoy da `G22-0010`,
que ya existe en HISTÓRICO). Por eso `G22-0001`…`G22-0009` están repetidos entre CONTENIDOS y HISTÓRICO.
La app los separa por pestaña, pero el historial y los comentarios se guardan por ID y se mezclan.
Solución en el Sheet: renumerar esos 9 de CONTENIDOS desde `G22-0052` y cambiar la fórmula por
`="G22-"&TEXT(MAX(ARRAYFORMULA(IFERROR(VALUE(RIGHT({'📋 CONTENIDOS'!A2:A;'🗄️ HISTÓRICO'!A2:A};4));0)))+1;"0000")`.

## Estructura del código

- `src/lib/provider.ts`: interfaz `DataProvider` + `GoogleSheetsDataProvider` (Sheets API v4). Para migrar a otra base alcanza con escribir otro provider.
- `src/lib/codec.ts`: fila ↔ publicación, celdas a escribir y detección de conflictos (con tests en `codec.test.ts`).
- `src/lib/demo.ts`: datos de demostración, solo sin conexión.
- `src/lib/store.tsx`: estado, sincronización y guardado optimista.
- `src/app/*`: Inicio, Calendario, Producción, Cronología, Mis tareas, Estadísticas, Sponsors y Configuración.

`npm test` corre los tests · `npm run build` compila para producción.

## Pendiente (fases siguientes)

- Adjuntos subidos a Google Drive. Hoy se pega el link en “Link / Asset” y se muestra una vista previa si es de Drive o una imagen.
- Drag & drop en celular. En el celular se cambia estado y fecha desde la ficha.
- Notificaciones, G22 Scores, Meta API y automatizaciones.
