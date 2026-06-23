import express from 'express';
import os from 'os';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY)?.trim();
if (!GEMINI_API_KEY) {
  console.error('Fatal: GEMINI_API_KEY / GOOGLE_API_KEY / API_KEY is not configured.');
  console.error('Copy .env.example to .env and set GEMINI_API_KEY, or configure one of the supported secret names in your environment.');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const MODELS_CONFIG = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-preview-02-05',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-2.0-pro-exp-02-05',
  'gemini-2.0-flash-thinking-exp-01-21',
  'gemini-exp-1219',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-002',
  'gemini-1.5-pro-001',
  'gemini-1.5-pro-002',
  'gemini-3.0-flash-preview',
  'gemini-3.1-flash-lite'
];

// Global state to track model availability
const EXHAUSTED_UNTIL: Record<string, number> = {};
const FAILED_MODELS = new Set<string>();

async function generateWithRetry(fn: (model: string) => Promise<any>, retries = 50) {
  let lastError: any;
  const startTime = Date.now();
  
  for (let i = 0; i < retries; i++) {
    const totalElapsed = Date.now() - startTime;
    // Total timeout budget of 110 seconds
    if (totalElapsed > 110000) {
       console.warn('[TIMEOUT] generateWithRetry budget exhausted (110s)');
       break;
    }

    const now = Date.now();
    const availableModels = MODELS_CONFIG.filter(m => 
      !FAILED_MODELS.has(m) && (!EXHAUSTED_UNTIL[m] || EXHAUSTED_UNTIL[m] < now)
    );

    if (availableModels.length === 0) {
      const waitTime = Math.min(5000, 1000 * Math.pow(1.2, i));
      console.warn(`[ALL_EXHAUSTED] No models available. Waiting ${Math.round(waitTime)}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime)); 
      continue;
    }

    // Try models in randomized order
    const shuffledModels = [...availableModels].sort(() => Math.random() - 0.5);
    
    for (const model of shuffledModels) {
      try {
        const result = await fn(model);
        if (!result) throw new Error('Empty response from model');
        return result;
      } catch (error: any) {
        lastError = error;
        let status = error?.status || error?.code;
        let message = error?.message?.toLowerCase() || '';
        
        // Try to parse nested JSON error if present
        if (message.includes('{"error"')) {
          try {
            const jsonPart = message.substring(message.indexOf('{'));
            const jsonError = JSON.parse(jsonPart);
            if (jsonError.error?.code) status = jsonError.error.code;
            if (jsonError.error?.message) message = jsonError.error.message.toLowerCase();
          } catch (e) {}
        }
        
        // Handle 429 and common "high demand" errors
        const isRateOrBusy = status === 429 || message.includes('quota') || message.includes('limit') || status === 503 || message.includes('overloaded') || message.includes('exhausted') || message.includes('capacity');
        
        if (isRateOrBusy) {
          const cooldown = 20000 + Math.random() * 20000;
          EXHAUSTED_UNTIL[model] = Date.now() + cooldown; 
          console.warn(`[THROTTLE] ${model} exhausted for ${Math.round(cooldown/1000)}s. Msg: ${message.substring(0, 50)}`);
          continue; 
        }

        if (status === 404 || message.includes('not found')) {
          console.error(`[BLACKLIST] Model ${model} not found.`);
          FAILED_MODELS.add(model);
          continue;
        }

        if (status === 400 && (message.includes('safety') || message.includes('block'))) {
          console.warn(`[SAFETY] Model ${model} blocked.`);
          EXHAUSTED_UNTIL[model] = Date.now() + 5000;
          continue;
        }

        console.warn(`[RETRY] Error (${status}) from ${model}: ${message.substring(0, 100)}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        break; 
      }
    }
  }
  
  if (lastError?.status === 429 || lastError?.message?.includes('QUOTA') || lastError?.message?.toLowerCase()?.includes('limit')) {
    throw new Error('QUOTA_EXCEEDED');
  }
  throw lastError || new Error('Computational matrix overloaded. Please try again.');
}

// Helper to clean JSON string from potential markdown blocks
function cleanJSON(text: string) {
  return text.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
}

function getAuthErrorMessage(error: any) {
  const msg = (error?.message || String(error || '')).toString();
  if (/default credentials/i.test(msg) || msg.includes('Could not load the default credentials')) {
    return 'Authentication failed: GEMINI_API_KEY is missing or invalid. Set GEMINI_API_KEY in .env or your environment variables, then restart the server.';
  }
  return msg;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/generate-question', async (req, res) => {
    try {
      const { topic, subject, unit, difficulty, type, excludeQuestions, cognitiveAspect } = req.body;
      
      const targetType = (type === 'mcq' || type === 'short_answer' || type === 'long_answer') ? type : 'short_answer';

      let prompt = `Generate one unique question about the topic: "${topic}".
      Context details: Subject "${subject}", Unit "${unit}".
      
      Requirements for Question Type:
      - Requested specific type: "${targetType}".
        * "mcq" is a multiple choice question with exactly 4 option choices where one is clearly correct.
        * "short_answer" is a question requiring a concise, direct, and factually/conceptually precise answer (typically 1-3 sentences) testing core terminology or basic logic.
        * "long_answer" is an analytical, essay-style, or system design question requiring detailed layout of trade-offs, step-by-step processes, structural explanations, or architecture plans.
      
      Requirements for Difficulty:
      - Requested difficulty level: "${difficulty || 'medium'}". Maintain strict alignment in wording complexity, edge cases, and logical depth.
      
      Requirements for Cognitive Aspect (Bloom's Taxonomy matching):
      - Targeted cognitive dimension: "${cognitiveAspect || 'any'}". Please construct the question task to test one of these cognitive levels specifically:
        * "Remembering" (facts recall, essential definitions, syntax, formulas)
        * "Understanding" (concept explanations, translating schemas, analyzing principles)
        * "Applying" (using theories in a specific practical mock context, computing math, debugging code snippets)
        * "Analyzing" (examining connection points, dissecting components, comparing architectures)
        * "Evaluating" (justifying optimal designs, critiquing security flaws, scoring architectural trade-offs)
        * "Creating" (synthesizing mock plans, designing a logical system schema, outlining mitigation systems)
        
      Ensure the output JSON strictly populates:
      - "questionType": Must be exactly "${targetType}".
      - "cognitiveAspect": The chosen Bloom's Taxonomy dimension (e.g. "Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", "Creating").
      - "cognitiveDesc": A brief 1-sentence explanation of what sub-skill is evaluated (e.g., "Tests the ability to formulate pointer offset calculations in assembly structures").
      - "difficulty": Must be "${difficulty || 'medium'}".
      - "question": The actual question text.
      - "options": For 'mcq', exactly 4 distinct and plausible option strings. For 'short_answer' or 'long_answer', options MUST be an empty array [].
      - "correctAnswer": For 'mcq', the exact correct option string. For 'short_answer', a perfect concise model answer. For 'long_answer', a multi-faceted assessment criteria rubric detailing what specific key points, trade-offs, and terms the student must cover to score a 10.
      - "explanation": In-depth, elegant rationale explaining the correct answer, underlying mechanics, and logical pitfalls of other choices.
      
      Format the output as clean JSON complying with the specified schema.`;

      if (excludeQuestions && Array.isArray(excludeQuestions) && excludeQuestions.length > 0) {
        prompt += `\n\n======================================================
CRITICAL NEGATIVE CONSTRAINTS (DEDUPLICATION RULES):
- Do NOT generate ANY question that matches, resembles, shares the same core answer, or is structurally/thematically identical to any of these previously asked questions:
${excludeQuestions.map((q, idx) => `  ${idx + 1}. "${q}"`).join('\n')}
- Explore other areas, edge cases, formulas, applications, or sub-aspects of "${topic}". Ensure the formulation is 100% fresh and unique.
======================================================`;
      }

      const response = await generateWithRetry((model) => ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: 'Only for MCQ (exact 4 choices). For non-MCQ, return an empty array.'
              },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING },
              questionType: { type: Type.STRING, description: 'Must be "mcq", "short_answer", or "long_answer"' },
              cognitiveAspect: { type: Type.STRING, description: 'Must be "Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", or "Creating"' },
              cognitiveDesc: { type: Type.STRING, description: 'One sentence explaining evaluated skill' },
              difficulty: { type: Type.STRING, description: 'Must be "easy", "medium", or "hard"' }
            },
            required: ['question', 'correctAnswer', 'explanation', 'questionType', 'cognitiveAspect', 'cognitiveDesc', 'difficulty']
          }
        }
      }));
      // Try to parse the model output as JSON, but return helpful diagnostics on failure
      try {
        const parsed = JSON.parse(cleanJSON(response.text));
        return res.json(parsed);
      } catch (parseErr) {
        console.error('Failed to parse model JSON:', parseErr, 'raw:', response.text?.slice?.(0, 1000));
        return res.status(502).json({ error: 'Invalid response from model', raw: response.text });
      }
    } catch (error: any) {
      console.error('Error generating question:', error);
      if (error.message === 'QUOTA_EXCEEDED') {
        return res.status(429).json({ error: 'System overload. Re-calibrating neurals... Try in 30s.' });
      }
      const msg = getAuthErrorMessage(error);
      return res.status(500).json({ error: 'Neural link unstable. Please try again.', message: msg });
    }
  });

  app.post('/api/evaluate-answer', async (req, res) => {
    try {
      const { question, studentAnswer, correctAnswer, questionType, cognitiveAspect, difficulty } = req.body;
      const response = await generateWithRetry((model) => ai.models.generateContent({
        model,
        contents: `Evaluate the student's answer for this academic challenge.
        
        [Challenge Metadata]
        - Question: ${question}
        - Type: ${questionType || 'unknown'}
        - Skill Target: ${cognitiveAspect || 'unknown'}
        - Target Complexity: ${difficulty || 'unknown'}
        - Model Reference Answer / Rubric: ${correctAnswer}
        
        [Student Response]
        - Answer: ${studentAnswer}
        
        [Evaluation Directives]
        - MCQ: Grade strictly binary (10/10 if matching the exact correct answer/criteria, 0/10 otherwise). Be extremely strict.
        - Short Answer: Grade out of 10. Prioritize factual and conceptual precision. If they are correct and direct, award high score. Do not penalize for short length if it is accurate.
        - Long Answer: Grade out of 10. Grade on depth of understanding, coverage of core factors in reference rubric, logical trade-offs discussion, and original analysis. Be analytical.
        
        Provide high-quality constructive human-like feedback, a final score out of 10, the official correct answer/rubric summary, and a detailed step-by-step performance analysis explanation.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              feedback: { type: Type.STRING },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ['score', 'feedback', 'correctAnswer', 'explanation']
          }
        }
      }));
      try {
        const parsed = JSON.parse(cleanJSON(response.text));
        return res.json(parsed);
      } catch (parseErr) {
        console.error('Failed to parse evaluation JSON:', parseErr, 'raw:', response.text?.slice?.(0, 1000));
        return res.status(502).json({ error: 'Invalid evaluation response from model', raw: response.text });
      }
    } catch (error: any) {
      console.error('Error evaluating answer:', error);
      if (error.message === 'QUOTA_EXCEEDED') {
        return res.status(429).json({ error: 'Analytical engine cooled down. Retry in 20s.' });
      }
      const msg = getAuthErrorMessage(error);
      return res.status(500).json({ error: 'Evaluation system failed to initialize. Try again.', message: msg });
    }
  });

  app.post('/api/help', async (req, res) => {
    try {
      const { text, action, language } = req.body;
      let prompt = '';
      if (action === 'translate') {
        prompt = `Translate the following text into ${language}: "${text}"`;
      } else if (action === 'explain') {
        prompt = `Provide a clear, detailed, and simple explanation for the following content: "${text}"`;
      }

      const response = await generateWithRetry((model) => ai.models.generateContent({
        model,
        contents: prompt
      }));
      res.json({ result: response.text });
    } catch (error: any) {
      console.error('Error in help endpoint:', error);
      if (error.message === 'QUOTA_EXCEEDED') {
        return res.status(429).json({ error: 'Language synth busy. Retrying in 15s...' });
      }
      const msg = getAuthErrorMessage(error);
      return res.status(500).json({ error: 'Service temporarily detached.', message: msg });
    }
  });

  app.post('/api/chat-tutor', async (req, res) => {
    try {
      const { message, history, context } = req.body;

      // Establish system guidance based on current learning selections
      let contextStr = "You are 'AI Scholar Tutor', a brilliant, supportive, and cybernetic academic mentor guiding the user in digital science and technology.\n";
      contextStr += "The user's current academic metadata/context is:\n";
      if (context) {
        if (context.yearName) contextStr += `- Tier: ${context.yearName}\n`;
        if (context.subjectName) contextStr += `- Domain/Subject: ${context.subjectName}\n`;
        if (context.unitName) contextStr += `- Module Unit: ${context.unitName}\n`;
        if (context.topicName) contextStr += `- Sector Topic: ${context.topicName}\n`;
        if (context.difficulty) contextStr += `- Difficulty Calibration: ${context.difficulty}\n`;
      } else {
        contextStr += "- Core General Nexus\n";
      }
      contextStr += "\nProvide beautiful, extremely precise, highly structured academic guidance. Utilize precise terminology, bullet points, code blocks (if applicable), and subheadings in your explanations. Keep replies very engaging and readable. Direct your help specifically towards helping them master the topic!";

      // Convert history array to the schema expected by generateContent
      const contents = [];
      if (history && Array.isArray(history)) {
        history.forEach((h: any) => {
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        });
      }

      // Add the latest query
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      const response = await generateWithRetry((model) => ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: contextStr,
        }
      }));

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Error in tutor chat endpoint:', error);
      if (error.message === 'QUOTA_EXCEEDED') {
        return res.status(429).json({ error: 'Tutor neural engine throttled. Cool-down active. Please try again in 10s.' });
      }
      const msg = getAuthErrorMessage(error);
      return res.status(500).json({ error: 'Core transmission lost. Retrying...', message: msg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    // Show all local network addresses for easier LAN testing
    try {
      const nets = os.networkInterfaces();
      const addresses: string[] = [];
      Object.keys(nets).forEach((ifname) => {
        (nets as any)[ifname].forEach((iface: any) => {
          if (iface.family === 'IPv4' && !iface.internal) {
            addresses.push(iface.address);
          }
        });
      });
      console.log(`Server running on http://localhost:${PORT}`);
      if (addresses.length > 0) {
        addresses.forEach(ip => console.log(`Accessible on LAN: http://${ip}:${PORT}`));
      } else {
        console.log('No non-internal IPv4 addresses detected. Use localhost or check network settings.');
      }
    } catch (e) {
      console.log(`Server running on http://localhost:${PORT}`);
    }
  });
}

startServer();
