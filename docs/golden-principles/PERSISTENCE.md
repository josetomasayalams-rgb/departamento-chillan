# Persistencia intercambiable

## Regla

La UI usa exclusivamente `state.store`; el modo local y el modo Supabase deben exponer el mismo contrato.

La selección del backend ocurre en `initStore()`. El render, los formularios y las acciones de usuario no deben conocer qué adaptador está activo.

## Sí

```js
await state.store.add(reservation);
state.store.onChange(load);
```

```js
// Un adaptador nuevo conserva el contrato existente.
state.store = { all, add, remove, update, onChange };
```

## No

```js
// Acopla una vista a un proveedor y rompe el modo local.
await supabase.from("reservations").insert(reservation);
```

```js
// Evita bifurcar la interfaz según el proveedor.
if (CONFIG.supabaseUrl) renderRemote();
else renderLocal();
```

## Verificación

- Busca accesos a `localStorage` y Supabase fuera de la inicialización de adaptadores.
- Prueba crear, editar, eliminar y recargar en modo local.
- Ejecuta `make ci` para conservar el marcador `initStore()` y los límites de imports.

## Excepción

Solo `initStore()` y los adaptadores que crea pueden conocer el cliente de Supabase o `localStorage`.
