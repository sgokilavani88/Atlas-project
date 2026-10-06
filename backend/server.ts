
import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: string,
  systemInstruction: string
) {
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];

  let lastErr: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      return { response, model };
    } catch (err: any) {
      lastErr = err;
    }
  }

  throw lastErr;
}

async function startServer() {
  const app = express();

  // Render provides PORT automatically.
  // For local testing, use port 3000.
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // =========================================================
  // API: Narrate
  // =========================================================

  app.post('/api/narrate', async (req, res) => {
    try {
      const { prompt, systemInstruction } = req.body || {};

      const apiKey = process.env.GEMINI_API_KEY;

      if (
        !apiKey ||
        apiKey === 'MY_GEMINI_API_KEY' ||
        apiKey.trim() === ''
      ) {
        return res.json({
          text: null,
          tokensUsed: 0,
          mode: 'deterministic_fallback',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const { response, model } = await generateWithFallback(
        ai,
        String(prompt || ''),
        systemInstruction ||
          'You are a calm, precise clinical trial pharmacovigilance medical writer. Summarize deterministic findings into clear, plain-English clinical sentences without inventing any facts, numbers, or records.'
      );

      const text = response.text || '';

      const tokensUsed =
        response.usageMetadata?.totalTokenCount ||
        Math.ceil(
          (String(prompt || '').length + text.length) / 4
        );

      return res.json({
        text,
        tokensUsed,
        mode: model,
      });
    } catch (err: any) {
      return res.status(200).json({
        text: null,
        tokensUsed: 0,
        mode: 'deterministic_fallback',
        error: err?.message || 'Model unavailable',
      });
    }
  });

  // =========================================================
  // API: Atlas Ask
  // =========================================================

  app.post('/api/atlas-ask', async (req, res) => {
    try {
      const {
        question,
        studyContext,
        deterministicAnswer,
      } = req.body || {};

      const apiKey = process.env.GEMINI_API_KEY;

      if (
        !apiKey ||
        apiKey === 'MY_GEMINI_API_KEY' ||
        apiKey.trim() === ''
      ) {
        return res.json({
          text: null,
          tokensUsed: 0,
          mode: 'deterministic_only',
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = [
        `User Question: "${question}"`,
        '',
        'Deterministic Engine Answer & Citations:',
        JSON.stringify(deterministicAnswer, null, 2),
        '',
        'Full Study & Project Context:',
        JSON.stringify(studyContext, null, 2),
      ].join('\n');

      const { response, model } = await generateWithFallback(
        ai,
        prompt,
        'You are Atlas, the deterministic clinical trial & project intelligence engine inside Study Sentinel. Answer any question the user asks about the Study Sentinel project, its 3-layer architecture (Layer A Atlas Graph, Layer B 6-Node ReviewCrew, Layer C 12-Cut StudyWatch & Decision Ledger), its UI screens (Poster & Data, Atlas 360, Monitor Crew, 12-Cut Watch, Explain Ledger & Judge Mode, Report, Tamper Lab, Self-Check), or the loaded clinical trial dataset (subjects, sites, labs, vitals, medications, AEs, protocol versions, amendments, adversarial events, corrections, queries). Keep answers clear, direct, and grounded in the Deterministic Engine Answer and Study Context. Cite specific subject IDs, site IDs, Cuts, and RecordRefs (e.g. LB SUBJ #3) when relevant. Never invent clinical records that do not exist in the context; if a question is a trap about unrecorded clinical modalities (like brain MRI or genome sequencing), explicitly confirm that zero records exist.'
      );

      const text = response.text || '';

      const tokensUsed =
        response.usageMetadata?.totalTokenCount ||
        Math.ceil(
          (prompt.length + text.length) / 4
        );

      return res.json({
        text,
        tokensUsed,
        mode: model,
      });
    } catch (err: any) {
      return res.status(200).json({
        text: null,
        tokensUsed: 0,
        mode: 'deterministic_only',
        error: err?.message || 'Model unavailable',
      });
    }
  });

  // =========================================================
  // FRONTEND
  // Serve the built React/Vite frontend
  // =========================================================

  const distPath = path.resolve(
    process.cwd(),
    '..',
    'frontend',
    'dist'
  );

  app.use(express.static(distPath));

  // React SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(
      path.join(distPath, 'index.html')
    );
  });

  // =========================================================
  // START SERVER
  // =========================================================

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Study Sentinel server running on http://0.0.0.0:${PORT}`
    );
    console.log(`Frontend served from: ${distPath}`);
  });
}

startServer();

