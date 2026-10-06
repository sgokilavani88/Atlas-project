# Study Sentinel — Frontend + Backend (One URL)

## Folder structure

```text
study-sentinel/
├── frontend/       # React + Vite UI
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── backend/        # Express API + production server
│   ├── server.ts
│   └── package.json
├── package.json     # deployment/build commands
└── render.yaml
```

## Local development

From the project root:

```bash
npm install
npm run build
npm start
```

Then open:

`http://localhost:3000`

For frontend hot reload + backend development, use:

```bash
npm run dev
```

## Gemini API

Create an environment variable:

```text
GEMINI_API_KEY=your_key_here
```

Never commit the real API key.

## Deploy to Render as ONE URL

Create **one Web Service** from this GitHub repository.

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment: `Node`
- Environment Variable: `NODE_ENV=production`
- Environment Variable: `GEMINI_API_KEY=your_real_key`

After deployment, Render gives one URL such as:

`https://study-sentinel-xxxx.onrender.com`

That single URL serves both:
- the React frontend
- `/api/narrate`
- `/api/atlas-ask`

Do not create a separate Render Static Site for the frontend if you want one URL.
