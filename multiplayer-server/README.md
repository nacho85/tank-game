# Multiplayer server local

Servidor mínimo para el modo `Online 2v2`.

## Uso

```bash
cd multiplayer-server
npm install
npm start
```

Corre por defecto en `ws://localhost:3001`.

## Cliente

El frontend usa `NEXT_PUBLIC_TANK_WS_URL` si está definida.
Si no, cae en `ws://localhost:3001`.
