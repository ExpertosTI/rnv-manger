## Objetivo
Mejorar la materialización de listados de VPS y servicios en el asistente para que cada elemento sea accionable con un clic y facilitar acciones rápidas (vincular VPS o asignar servicios).

## Alcance
- Materializar listas de VPS y servicios sin cliente con tarjetas accionables.
- Mantener compatibilidad con los bloques existentes y enlaces action: en markdown.
- No cambiar la semántica de datos ni la lógica de negocio del backend.

## Enfoque
- Detectar resultados de funciones ejecutadas (list_vps, list_unassigned_services) en el mensaje del asistente.
- Renderizar un bloque adicional con tarjetas por elemento y un botón de acción directo.
- Aceptar enlaces action: en markdown para convertirlos en botones.

## Flujo
- AI ejecuta función.
- El resultado se devuelve con data.
- El frontend genera tarjetas y botones con acciones predefinidas.
- El botón envía un comando claro al asistente para completar la acción.

## Errores y fallback
- Si no hay data, no se renderiza el bloque.
- Si el asistente no puede completar la acción, mantiene el flujo actual de error y reintento.

## Pruebas
- Lint y build de escritorio.
- Verificación manual: listar VPS y servicios y comprobar botones de acción.
