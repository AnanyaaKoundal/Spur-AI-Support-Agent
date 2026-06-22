# Spur AI Support — Backend

Express backend for the AI-powered customer support chat application.

## Scripts

| Command                 | Description                  |
| ----------------------- | ---------------------------- |
| `npm run dev`           | Start dev server with watch  |
| `npm run build`         | Compile TypeScript           |
| `npm start`             | Start production server      |
| `npm run lint`          | Lint source files            |
| `npm run format`        | Format source files          |
| `npm run prisma:generate` | Generate Prisma Client     |
| `npm run prisma:migrate`  | Run Prisma migrations       |

## Environment

Copy `.env.example` to `.env` and configure:

```
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/spur_ai_support
OPENAI_API_KEY=
FRONTEND_URL=http://localhost:5173
```
