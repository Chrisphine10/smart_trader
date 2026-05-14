# Smart Trader

TypeScript API application with Express and SQLite.

## Setup

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run dev
```

The API starts on `http://localhost:3000` by default.

## Scripts

- `npm run dev` starts the TypeScript development server.
- `npm run db:migrate` applies SQLite migrations.
- `npm run typecheck` runs TypeScript checks without emitting files.
- `npm run build` compiles to `dist/`.
- `npm start` runs the compiled application.

## Endpoints

- `GET /health`
- `GET /api/trades`
- `POST /api/trades`
- `GET /api/trades/:id`
- `DELETE /api/trades/:id`

Example trade payload:

```json
{
  "symbol": "AAPL",
  "side": "buy",
  "quantity": 10,
  "price": 185.25,
  "executedAt": "2026-05-14T06:00:00.000Z",
  "notes": "Initial position"
}
```
