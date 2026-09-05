# Velocity Frontend

React + TypeScript frontend for the Velocity AI Recruitment Platform.

## Tech Stack

- **Build Tool**: Vite
- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (Radix UI)
- **Routing**: React Router
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form + Zod validation

## Project Structure

```
frontend/
├── src/
│   ├── components/      # React components
│   │   ├── ui/         # shadcn/ui components
│   │   └── ...         # Custom components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── App.tsx         # Main app component
│   └── main.tsx        # Entry point
├── public/             # Static assets
├── index.html          # HTML template
└── ...
```

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```
   The app will run on `http://localhost:8080` (or check `vite.config.ts` for port configuration)

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Preview production build**:
   ```bash
   npm run preview
   ```

## Environment Variables

Create a `.env` file in the frontend directory (optional):

```
VITE_API_URL=http://localhost:3000
```

## Development

- In Docker, the frontend communicates via same-origin `/api` through the Nginx reverse proxy.
- In standalone local development, requests are proxied to the backend at `http://localhost:3000`.
- Make sure the backend is running before testing API calls
- Hot module replacement (HMR) is enabled for fast development

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint















