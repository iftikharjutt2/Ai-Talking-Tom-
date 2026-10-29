import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  buildVisemeTimeline,
  synthesizeExpressiveSpeechWavBase64,
} from './src/game/lipSyncEngine.ts';
import {
  TOM_PERSONAS,
  detectUrduLanguage,
  enforceShortSpokenReply,
  generateDirectQuestionAnswer,
  type TomPersonaId,
  type TomEmotion,
} from './src/game/tomState.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

let cachedAiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;

function getGenAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
    return null;
  }
  if (cachedAiClient && cachedApiKey === key) {
    return cachedAiClient;
  }
  cachedApiKey = key;
  cachedAiClient = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return cachedAiClient;
}

/**
 * Fast, zero-latency emotion & follow-up inference from Tom's reply text.
 */
function inferEmotionAndFollowUps(
  userQuestion: string,
  replyText: string
): { emotion: TomEmotion; followUps: string[] } {
  const lowerReply = replyText.toLowerCase();
  const lowerQ = userQuestion.toLowerCase();
  const isUrdu = detectUrduLanguage(userQuestion) || /[\u0600-\u06FF]/.test(replyText);

  let emotion: TomEmotion = 'happy';
  if (
    lowerReply.includes('haha') ||
    lowerReply.includes('hehe') ||
    lowerReply.includes('joke') ||
    lowerQ.includes('joke') ||
    lowerQ.includes('lateefa') ||
    replyText.includes('ہاہا') ||
    replyText.includes('لطیفہ')
  ) {
    emotion = 'laughing';
  } else if (
    lowerReply.includes('!') &&
    (lowerReply.includes('wow') ||
      lowerReply.includes('salmon') ||
      lowerReply.includes('amazing') ||
      lowerReply.includes('awesome') ||
      replyText.includes('واہ') ||
      replyText.includes('مچھلی'))
  ) {
    emotion = 'excited';
  } else if (
    lowerQ.startsWith('why') ||
    lowerQ.startsWith('how') ||
    lowerQ.startsWith('what') ||
    lowerQ.includes('kyun') ||
    lowerQ.includes('kya') ||
    replyText.includes('کیونکہ') ||
    lowerReply.includes('because') ||
    lowerReply.includes('science')
  ) {
    emotion = 'curious';
  } else if (lowerReply.includes('exactly') || lowerReply.includes('answer is')) {
    emotion = 'proud';
  }

  if (isUrdu) {
    return {
      emotion,
      followUps: [
        'آسمان نیلا کیوں ہے؟',
        'کوئی مزاحیہ لطیفہ سناؤ!',
        'پاکستان کا دارالحکومت کیا ہے؟',
      ],
    };
  }

  let followUps = [
    'Tell me another cool fact!',
    'Tell me a funny cat joke!',
    'How do cats land on their feet?',
  ];

  if (lowerQ.includes('sky') || lowerQ.includes('space') || lowerQ.includes('science')) {
    followUps = [
      'Why do stars twinkle?',
      'How does gravity work?',
      'Can cats see in the dark?',
    ];
  } else if (lowerQ.includes('joke') || lowerQ.includes('funny')) {
    followUps = [
      'Tell me another cat pun!',
      'Give me a quick riddle!',
      'Why do cats love boxes?',
    ];
  } else if (lowerQ.includes('food') || lowerQ.includes('eat')) {
    followUps = [
      'Why do cats love fish?',
      'What is your favorite snack?',
      'Tell me a quick cooking tip!',
    ];
  }

  return { emotion, followUps };
}

async function synthesizeAudioWithFallback(
  ai: GoogleGenAI | null,
  text: string,
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr',
  styleHint: string,
  basePitchHz = 265
): Promise<{
  audioBase64: string;
  audioMimeType: string;
  durationSec: number;
  source: 'gemini-tts' | 'procedural-wav';
}> {
  if (ai) {
    try {
      const ttsResp = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text,
                speechMetadata: {
                  style: styleHint,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio =
        ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const wavBuffer = Buffer.from(base64Audio, 'base64');
        const pcmBytes = Math.max(0, wavBuffer.byteLength - 44);
        const computedDuration = Number(
          Math.max(0.6, pcmBytes / (24000 * 2)).toFixed(2)
        );
        return {
          audioBase64: base64Audio,
          audioMimeType: 'audio/wav',
          durationSec: computedDuration,
          source: 'gemini-tts',
        };
      }
    } catch (err) {
      console.warn('Gemini TTS fallback triggered:', (err as Error)?.message);
    }
  }

  const synth = synthesizeExpressiveSpeechWavBase64(text, { basePitchHz });
  return {
    audioBase64: synth.wavBase64,
    audioMimeType: 'audio/wav',
    durationSec: synth.durationSec,
    source: 'procedural-wav',
  };
}

function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const {
        message = '',
        history = [],
        personaId = 'witty_bestie',
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'tom'; text: string }>;
        personaId?: TomPersonaId;
      };

      const trimmed = String(message).trim();
      if (!trimmed) {
        res.status(400).json({ error: 'Please type or say something to Tom!' });
        return;
      }

      const persona = TOM_PERSONAS[personaId] || TOM_PERSONAS.witty_bestie;
      const ai = getGenAIClient();
      const isUrdu = detectUrduLanguage(trimmed);

      let replyText = '';
      let emotion: TomEmotion = 'happy';
      let followUps: string[] = [];

      if (ai) {
        const recentHistoryText = Array.isArray(history)
          ? history
              .slice(-2)
              .map((h) => `${h.role === 'user' ? 'User' : 'Tom'}: ${h.text}`)
              .join('\n')
          : '';

        const promptContent = isUrdu
          ? `${recentHistoryText ? `${recentHistoryText}\n` : ''}User: ${trimmed}\nTom (اردو رسم الخط میں مختصر جواب، زیادہ سے زیادہ 15 الفاظ):`
          : `${recentHistoryText ? `${recentHistoryText}\n` : ''}User: ${trimmed}\nTom (max 15 words):`;

        const systemInstruction = isUrdu
          ? `${persona.systemPrompt} اہم اصول: صارف نے اردو یا رومن اردو میں بات کی ہے۔ ہمیشہ خالص، قدرتی اور آسان پاکستانی اردو رسم الخط (اردو حروف) میں جواب دیں۔ انگریزی یا رومن اردو میں ہرگز جواب نہ دیں۔ جواب بہت مختصر رکھیں (صرف 1 سے 2 چھوٹے جملے، زیادہ سے زیادہ 15 الفاظ)۔ سوال کو مت دہرائیں بلکہ سیدھا اور درست جواب دیں۔`
          : `${persona.systemPrompt} STRICT RULE: Reply in VERY SHORT, simple words (maximum 1 to 2 short sentences, strictly 8 to 16 words total). Directly answer the user's question first. Plain text only, never repeat the question.`;

        try {
          // Use ultra-fast gemini-3.1-flash-lite with ThinkingLevel.MINIMAL and strict short-word output
          const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: promptContent,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              maxOutputTokens: 55,
              systemInstruction,
              temperature: 0.55,
            },
          });

          const rawText = response.text?.trim();
          if (rawText) {
            replyText = rawText.replace(/^Tom(?:\s*\([^)]*\))?:\s*/i, '').trim();
          }
        } catch (err) {
          console.warn('Fast gemini-3.1-flash-lite call fallback:', (err as Error)?.message);
        }
      }

      if (!replyText) {
        const fb = generateDirectQuestionAnswer(trimmed, persona.id);
        replyText = fb.reply;
        emotion = fb.emotion;
        followUps = fb.followUps;
      } else {
        const inferred = inferEmotionAndFollowUps(trimmed, replyText);
        emotion = inferred.emotion;
        followUps = inferred.followUps;
      }

      // Strictly cap spoken reply to <= 18 words so it is always short and crisp
      replyText = enforceShortSpokenReply(replyText, 18);

      const isReplyUrdu = isUrdu || /[\u0600-\u06FF]/.test(replyText);

      if (isReplyUrdu) {
        // Synthesize authentic Pakistani Urdu native accent via Gemini TTS (with instant WAV fallback)
        const urduAudio = await synthesizeAudioWithFallback(
          ai,
          replyText,
          persona.voiceName,
          'Natural warm Pakistani Urdu native speaker accent (ur-PK), clear, friendly, and unhurried',
          Math.round(240 * persona.pitchShift)
        );
        const timeline = buildVisemeTimeline(replyText, urduAudio.durationSec);
        res.json({
          reply: replyText,
          emotion,
          followUps,
          audioBase64: urduAudio.audioBase64,
          audioMimeType: urduAudio.audioMimeType,
          durationSec: urduAudio.durationSec,
          audioSource: urduAudio.source,
          language: 'ur-PK',
          timeline,
        });
        return;
      }

      // Generate instant (~2ms) expressive formant WAV & phoneme timeline so /api/chat returns immediately!
      const instantWav = synthesizeExpressiveSpeechWavBase64(replyText, {
        basePitchHz: Math.round(255 * persona.pitchShift),
      });
      const timeline = buildVisemeTimeline(replyText, instantWav.durationSec);

      res.json({
        reply: replyText,
        emotion,
        followUps,
        audioBase64: instantWav.wavBase64,
        audioMimeType: 'audio/wav',
        durationSec: instantWav.durationSec,
        audioSource: 'instant-wav',
        language: 'en-US',
        timeline,
      });
    } catch (error) {
      console.error('Error in /api/chat:', error);
      res.status(500).json({
        error: 'Tom got his whiskers tangled! Please try again.',
      });
    }
  });

  app.post('/api/tts', async (req, res) => {
    try {
      const {
        text = '',
        personaId = 'witty_bestie',
        mimicPitch = false,
      } = req.body as {
        text?: string;
        personaId?: TomPersonaId;
        mimicPitch?: boolean;
      };

      const cleanText = String(text).trim();
      if (!cleanText) {
        res.status(400).json({ error: 'Missing text for speech synthesis.' });
        return;
      }

      const persona = TOM_PERSONAS[personaId] || TOM_PERSONAS.witty_bestie;
      const ai = getGenAIClient();

      const audioResult = await synthesizeAudioWithFallback(
        ai,
        cleanText,
        persona.voiceName,
        mimicPitch
          ? 'Playful, high-spirited, comedic Talking Tom repeat voice'
          : `Expressive, warm ${persona.name} voice`,
        mimicPitch ? 320 : Math.round(255 * persona.pitchShift)
      );

      const timeline = buildVisemeTimeline(cleanText, audioResult.durationSec);

      res.json({
        text: cleanText,
        audioBase64: audioResult.audioBase64,
        audioMimeType: audioResult.audioMimeType,
        durationSec: audioResult.durationSec,
        audioSource: audioResult.source,
        timeline,
      });
    } catch (error) {
      console.error('Error in /api/tts:', error);
      res.status(500).json({ error: 'Failed to synthesize voice.' });
    }
  });

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'No audio data provided.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'Voice transcription requires a configured Gemini API key.',
        });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe the spoken words accurately. Return only the transcribed text.',
            },
          ],
        },
      });

      res.json({
        transcript: (response.text || '').trim(),
      });
    } catch (error) {
      console.error('Error in /api/transcribe:', error);
      res.status(500).json({
        error: 'Could not transcribe audio clip.',
      });
    }
  });

  // Bind port 3000 immediately so container startup probes succeed without waiting for Vite cold-start
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Talking Tom Gemini Server listening on http://localhost:${PORT}`);
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const viteMiddlewarePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );

    app.use(async (req, res, next) => {
      try {
        const vite = await viteMiddlewarePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  }
}

startServer();
