import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const KEY_PATH = process.env.TTS_SERVICE_ACCOUNT || '/app/keys/service-account.json';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'gen-lang-client-0575393893';
const TTS_API = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * Generate TTS audio using Google Cloud Text-to-Speech REST API
 * Returns audio buffer (MP3)
 */
export async function generateTTS(text, { languageCode = 'ro-RO', voiceName = 'ro-RO-Wavenet-A', speakingRate = 1.0 } = {}) {
  const token = await getAccessToken();
  
  const response = await fetch(TTS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
        ssmlGender: 'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        pitch: 0,
      },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`TTS API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const audioContent = data.audioContent; // base64-encoded
  
  if (!audioContent) {
    throw new Error('TTS API returned no audio content');
  }

  return Buffer.from(audioContent, 'base64');
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
