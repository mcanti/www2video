import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const KEY_PATH = process.env.TTS_SERVICE_ACCOUNT || '/app/keys/service-account.json';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'gen-lang-client-0575393893';
const LOCATION = 'us-central1';
const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const TTS_API = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${TTS_MODEL}:generateContent`;

/**
 * Convert PCM Int16 buffer to WAV format
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const dataLength = pcmBuffer.length;
  const headerLength = 44;
  const buffer = Buffer.alloc(headerLength + dataLength);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
  buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

/**
 * Generate TTS audio using Vertex AI Gemini TTS Preview
 * Returns WAV audio buffer (converted from PCM @ 24kHz)
 */
export async function generateTTS(text, voice = 'Kore') {
  const token = await getAccessToken();

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `Say in Romanian: ${text}` }]
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice }
        }
      }
    }
  };

  const response = await fetch(TTS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Vertex AI TTS error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const base64Data = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Data) {
    throw new Error('Vertex AI TTS returned no audio data');
  }

  // Gemini TTS returns PCM Int16 @ 24kHz — convert to WAV
  const pcm = Buffer.from(base64Data, 'base64');
  return pcmToWav(pcm);
}

/**
 * Generate an OAuth2 access token from service account JWT
 */
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiry - 300000) {
    return cachedToken;
  }

  const keyData = JSON.parse(await fs.readFile(KEY_PATH, 'utf-8'));
  const { client_email, private_key, token_uri } = keyData;

  // Create JWT assertion
  const issued = Math.floor(Date.now() / 1000);
  const expires = issued + 3600; // 1 hour

  const jwtHeader = { alg: 'RS256', typ: 'JWT', kid: keyData.private_key_id };
  const jwtClaim = {
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: token_uri,
    exp: expires,
    iat: issued,
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signatureInput = `${encode(jwtHeader)}.${encode(jwtClaim)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(private_key, 'base64url');
  const assertion = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const response = await fetch(token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Token exchange failed: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  return cachedToken;
}
