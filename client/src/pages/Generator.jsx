import { useState, useEffect, useRef } from 'react';

const API = '';
const LS_KEY = 'www2video_history';

function usePollStatus(videoId, onReady) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/video/${videoId}/status`);
        const data = await res.json();
        if (cancelled) return;
        setStatus(data);

        if (data.status === 'ready' || data.status === 'failed') {
          if (data.status === 'ready' && onReady) onReady(data);
          return;
        }
        setTimeout(poll, 1500);
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [videoId]);

  return status;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch { return []; }
}

function saveToHistory(v) {
  const list = loadHistory().filter(item => item.id !== v.id);
  list.unshift({
    id: v.id,
    prompt: v.prompt,
    status: v.status,
    duration: v.duration || 10,
    width: v.width || 1280,
    height: v.height || 720,
    audioPrompt: v.audioPrompt || '',
    useAudio: v.useAudio || false,
    useSubtitles: v.useSubtitles || false,
    voiceName: v.voiceName || 'Kore',
    useWebsite: v.useWebsite || false,
    sourceUrl: v.sourceUrl || '',
    created_at: v.created_at || new Date().toISOString(),
  });
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
}

const GEMINI_VOICES = [
  // Feminine
  { name: 'Kore', label: 'Female / Firm, strong, authoritative yet approachable' },
  { name: 'Aoede', label: 'Female / Breezy, light and airy, melodic' },
  { name: 'Autonoe', label: 'Female / Bright, clear and optimistic' },
  { name: 'Callirrhoe', label: 'Female / Easy-going, relaxed and natural' },
  { name: 'Despina', label: 'Female / Smooth, polished and flowing' },
  { name: 'Erinome', label: 'Female / Clear, crisp and precise' },
  { name: 'Gacrux', label: 'Female / Mature, warm and seasoned' },
  { name: 'Laomedeia', label: 'Female / Upbeat, energetic and lively' },
  { name: 'Leda', label: 'Female / Youthful, fresh and friendly' },
  { name: 'Pulcherrima', label: 'Female / Forward, direct and confident' },
  { name: 'Sadachbia', label: 'Female / Lively, spirited and bright' },
  { name: 'Schedar', label: 'Female / Even, balanced and steady' },
  { name: 'Sulafat', label: 'Female / Warm, gentle and reassuring' },
  { name: 'Umbriel', label: 'Female / Easy-going, casual and natural' },
  { name: 'Vindemiatrix', label: 'Female / Gentle, soft and calming' },
  { name: 'Zephyr', label: 'Female / Bright, clear and fresh' },
  { name: 'Achernar', label: 'Female / Soft, gentle and soothing' },
  // Masculine
  { name: 'Puck', label: 'Male / Upbeat, lively and energetic' },
  { name: 'Charon', label: 'Male / Informative, calm and professional' },
  { name: 'Fenrir', label: 'Male / Excitable, dynamic and expressive' },
  { name: 'Alnilam', label: 'Male / Firm, strong and grounded' },
  { name: 'Orus', label: 'Male / Firm, solid and confident' },
  { name: 'Algenib', label: 'Male / Gravelly, rich and textured' },
  { name: 'Algieba', label: 'Male / Smooth, mellow and flowing' },
  { name: 'Achird', label: 'Male / Friendly, warm and approachable' },
  { name: 'Enceladus', label: 'Male / Breathy, intimate and close' },
  { name: 'Iapetus', label: 'Male / Clear, crisp and articulate' },
  { name: 'Rasalgethi', label: 'Male / Informative, educational and precise' },
  { name: 'Sadaltager', label: 'Male / Knowledgeable, authoritative yet approachable' },
  { name: 'Zubenelgenubi', label: 'Male / Casual, laid-back and conversational' },
];
const LUMI_DEFAULTS = {
  prompt: `Product launch video for LumiBot - an AI assistant bot that helps teams automate workflows and boost productivity. 

Scene 1 (0-3s): Futuristic title card with glowing "LumiBot" text, subtitle "AI-Powered Workflow Assistant". Dark background with subtle particle effect or radial glow in purple/teal. Text slides in from left with a slight blur-to-sharp effect.

Scene 2 (3-7s): Show three feature cards side by side. Card 1: "Smart Automation" with robot icon. Card 2: "Team Collaboration" with people icon. Card 3: "24/7 Availability" with clock icon. Each card slides up sequentially with a slight bounce.

Scene 3 (7-10s): Strong CTA panel. "Ready to Transform Your Workflow?" in large bold text. Below it: "Get Started at lumi.bot" with a glowing button outline effect. Final frame holds for 2s with a subtle breathe animation.`,
  duration: 10,
  useAudio: true,
  audioPrompt: "Introducing LumiBot - your intelligent AI workflow assistant. Automate repetitive tasks, collaborate seamlessly with your team, and keep your projects running 24/7. Ready to transform how you work? Visit Lumi.bot and get started today.",
  useWebsite: true,
  sourceUrl: 'https://lumi.bot',
};

export default function Generator() {
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(10);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [useWebsite, setUseWebsite] = useState(false);
  const [useAudio, setUseAudio] = useState(false);
  const [useSubtitles, setUseSubtitles] = useState(false);
  const [audioPrompt, setAudioPrompt] = useState('');
  const [voiceName, setVoiceName] = useState('Kore');
  const [videoId, setVideoId] = useState(null);
  const [mode, setMode] = useState('idle'); // idle | generating | preview | error
  const [history, setHistory] = useState(loadHistory);
  const [error, setError] = useState('');
  const [historyStatus, setHistoryStatus] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugHtml, setDebugHtml] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const previewRef = useRef(null);

  // Feature flag: debug mode via URL param ?debug=true or toggle
  const isDebug = window.location.search.includes('debug=true');

  // Update localStorage history when polling detects final status
  const handlePollReady = (data) => {
    const list = loadHistory();
    const idx = list.findIndex(item => item.id === videoId);
    if (idx !== -1 && list[idx].status !== 'ready' && list[idx].status !== 'failed') {
      list[idx].status = data.status;
      localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
      setHistory(loadHistory());
    }
    setMode('preview');
  };

  const status = usePollStatus(mode === 'generating' ? videoId : null, handlePollReady);

  // Load debug info (HTML composition) when viewing a ready video
  useEffect(() => {
    if (!videoId || mode !== 'preview') return;
    const fetchDebug = async () => {
      try {
        const res = await fetch(`${API}/api/video/${videoId}/preview`);
        if (res.ok) {
          const html = await res.text();
          setDebugHtml(html);
        }
      } catch {}
    };
    fetchDebug();
  }, [videoId, mode, isDebug]);

  // Load a video's full status and restore form fields when clicking history
  const loadHistoryVideo = async (v) => {
    if (v.status !== 'ready' && v.status !== 'failed') return;
    setVideoId(v.id);
    setMode('preview');
    // Restore all form fields from history entry
    setPrompt(v.prompt || '');
    setDuration(v.duration || 10);
    setWidth(v.width || 1280);
    setHeight(v.height || 720);
    setUseAudio(v.useAudio || false);
    setUseSubtitles(v.useSubtitles || false);
    setAudioPrompt(v.audioPrompt || '');
    setVoiceName(v.voiceName || 'Kore');
    setUseWebsite(v.useWebsite || false);
    setUrl(v.sourceUrl || '');
    setHistoryStatus(null);
    try {
      const res = await fetch(`${API}/api/video/${v.id}/status`);
      const data = await res.json();
      setHistoryStatus(data);
      // Restore auto-generated narration text from server
      if (data.tts_text) {
        setUseAudio(true);
        setAudioPrompt(data.tts_text);
      }
      if (data.tts_voice) {
        setVoiceName(data.tts_voice);
      }
    } catch {}
  };

  // Delete a history entry from localStorage and DB
  const handleDeleteHistory = async (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await fetch(`${API}/api/video/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[delete] API call failed, removing from localStorage anyway:', err.message);
    }
    const list = loadHistory().filter(item => item.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    setHistory(loadHistory());
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;

    // Reset videoId first so usePollStatus doesn't poll the old video
    setVideoId(null);
    setMode('generating');
    setError('');
    setDebugHtml('');

    const options = { quality: 'draft', duration, width, height, useAudio, useSubtitles, voiceName };
    if (audioPrompt.trim()) options.audioPrompt = audioPrompt.trim();
    if (useWebsite && url.trim()) options.sourceUrl = url.trim();
    const body = { prompt: text, options };

    try {
      const res = await fetch(`${API}/api/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setMode('idle'); return; }
      setVideoId(data.videoId);
      saveToHistory({
        id: data.videoId, prompt: text, status: 'generating',
        duration, width, height, useAudio, useSubtitles, audioPrompt: audioPrompt.trim(),
        voiceName,
        useWebsite, sourceUrl: url.trim(),
        created_at: new Date().toISOString(),
      });
      setHistory(loadHistory());
    } catch (err) {
      setError(err.message);
      setMode('idle');
    }
  };

  const handleRegenerate = () => {
    setVideoId(null);
    handleGenerate();
  };

  // Load lumi.bot defaults (debug mode only)
  const loadLumiDefaults = () => {
    setPrompt(LUMI_DEFAULTS.prompt);
    setDuration(LUMI_DEFAULTS.duration);
    setUseAudio(LUMI_DEFAULTS.useAudio);
    setAudioPrompt(LUMI_DEFAULTS.audioPrompt);
    setUseWebsite(LUMI_DEFAULTS.useWebsite);
    setUrl(LUMI_DEFAULTS.sourceUrl);
  };

  const isGenerating = mode === 'generating';

  // Timeline steps
  const timelineSteps = [
    { step: 'initializing', icon: '📁', label: 'Pregătire proiect' },
    { step: 'generating_composition', icon: '🤖', label: 'Generare conținut' },
    { step: 'writing_composition', icon: '💾', label: 'Salvare' },
    { step: 'validating', icon: '🔍', label: 'Validare' },
    { step: 'rendering_video', icon: '🎬', label: 'Generare video' },
    { step: 'finalizing', icon: '📦', label: 'Finalizare' },
  ];
  // Map backend granular steps to template step groups
  const stepGroups = {
    'initializing': 0, 'initialized': 0,
    'generating_composition': 1, 'composition_ai': 1, 'composition_done': 1,
    'generating_audio': 1, 'audio_done': 1, 'audio_skip': 1,
    'writing_composition': 2,
    'validating': 3, 'lint_warning': 3, 'validated': 3,
    'rendering_video': 4,
    'finalizing': 5,
    'fetching_website': 0, 'extracting_identity': 1, 'saving_identity': 2,
    'ready': 6, 'failed': 6, 'queued': -1,
  };
  const stepOrder = ['initializing', 'generating_composition', 'writing_composition', 'validating', 'rendering_video', 'finalizing', 'ready'];

  return (
    <div className="app">
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 0', borderBottom: '1px solid var(--border)',
      }}>
        <img src="https://cognitum.ro/assets/logo-inv.png" style={{ height: 28, opacity: 0.8 }} alt="Cognitum" />
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>www2video</h1>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block' }}>AI video generator</span>
        </div>
        {isDebug && (
          <span style={{
            fontSize: 11, padding: '2px 10px',
            background: 'var(--accent)', color: '#fff', borderRadius: 4,
          }}>DEBUG</span>
        )}
      </header>

      <main style={{ display: 'flex', gap: 24, flexDirection: 'column' }}>
        {/* Debug feature flag toggle */}
        {isDebug && (
          <div style={{
            background: '#1a1a2e', border: '1px solid var(--accent)',
            borderRadius: 12, padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>⚙️ Debug Tools</span>
              <button
                onClick={loadLumiDefaults}
                style={{
                  padding: '6px 14px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                🚀 Load lumi.bot defaults
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Use acest buton pentru a pre-popula formularul cu valori potrivite pentru un product launch video LumiBot.
              Ajustează promptul, durata sau audio-ul după preferințe, apoi generează.
            </div>
          </div>
        )}

        {/* Input + Preview row */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* Left panel */}
          <div style={{ flex: '1 1 400px', minWidth: 320 }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 0, overflow: 'hidden',
            }}>
              {/* Section: Conținut */}
              <div style={{ padding: '20px 24px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  📝 Conținut
                </div>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g. Un clip de prezentare de 10 secunde pentru o cafea premium..."
                  rows={4}
                  style={{
                    width: '100%', background: '#111', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', padding: 12, fontSize: 14,
                    resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 24px', opacity: 0.4 }} />

              {/* Section: Setări */}
              <div style={{ padding: '16px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  ⚙️ Setări
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '0 0 auto' }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Durată (secunde)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={duration}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '' || /^\d+$/.test(v)) {
                          const n = parseInt(v, 10);
                          if (n >= 1 && n <= 120) setDuration(n);
                          else if (v === '') setDuration('');
                        }
                      }}
                      onBlur={e => {
                        const n = parseInt(e.target.value, 10);
                        if (isNaN(n) || n < 1) setDuration(10);
                        else if (n > 120) setDuration(120);
                        else setDuration(n);
                      }}
                      style={{
                        width: 90, background: '#111', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 14,
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Rezoluție
                    </label>
                    <select
                      value={`${width}x${height}`}
                      onChange={e => {
                        const [w, h] = e.target.value.split('x').map(Number);
                        setWidth(w);
                        setHeight(h);
                      }}
                      style={{
                        width: '100%', background: '#111', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 14,
                        fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <option value="1280x720">1280×720 (HD)</option>
                      <option value="1920x1080">1920×1080 (Full HD)</option>
                      <option value="2560x1440">2560×1440 (2K)</option>
                      <option value="720x1280">720×1280 (Reels)</option>
                      <option value="1080x1920">1080×1920 (Full Reels)</option>
                      <option value="1080x1080">1080×1080 (Square)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 24px', opacity: 0.4 }} />

              {/* Section: Surse */}
              <div style={{ padding: '16px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  🌐 Surse
                </div>
                {/* From website checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: useWebsite ? 8 : 0 }}>
                  <input
                    type="checkbox"
                    id="chk-website"
                    checked={useWebsite}
                    onChange={e => setUseWebsite(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="chk-website" style={{ fontSize: 13, cursor: 'pointer' }}>
                    🌐 From website
                  </label>
                </div>
                {useWebsite && (
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    style={{
                      width: '100%', marginTop: 0, background: '#111',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', padding: 12, fontSize: 14,
                      fontFamily: 'inherit',
                    }}
                  />
                )}

                {/* Audio toggle */}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    id="chk-audio"
                    checked={useAudio}
                    onChange={e => setUseAudio(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="chk-audio" style={{ fontSize: 13, cursor: 'pointer' }}>
                    🎵 Audio (narare)
                  </label>
                </div>
                {useAudio && (
                  <textarea
                    value={audioPrompt}
                    onChange={e => setAudioPrompt(e.target.value)}
                    placeholder="Scrie textul pe care sa-l spuna naratorul sau lasă gol și va fi generat automat un text potrivit"
                    rows={3}
                    style={{
                      width: '100%', marginTop: 8, background: '#111',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', padding: 12, fontSize: 14,
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 24px', opacity: 0.4 }} />

              {/* Section: Subtitrări & Voce */}
              <div style={{ padding: '16px 24px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  🔊 Subtitrări &amp; Voce
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    id="chk-subtitles"
                    checked={useSubtitles}
                    onChange={e => setUseSubtitles(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <label htmlFor="chk-subtitles" style={{ fontSize: 13, cursor: 'pointer' }}>
                    📝 Subtitles
                  </label>
                </div>
                {useAudio && (
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      Voce narator
                    </label>
                    <select
                      value={voiceName}
                      onChange={e => setVoiceName(e.target.value)}
                      style={{
                        width: '100%', background: '#111', border: '1px solid var(--border)',
                        borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13,
                        fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      {GEMINI_VOICES.map(v => (
                        <option key={v.name} value={v.name}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 24px', opacity: 0.4 }} />

              {/* Generate button section */}
              <div style={{ padding: '16px 24px 20px' }}>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  style={{
                    width: '100%', padding: '14px 24px',
                    background: isGenerating || !prompt.trim()
                      ? 'var(--accent)'
                      : 'linear-gradient(135deg, #6c63ff 0%, #a78bfa 50%, #7c3aed 100%)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    opacity: isGenerating || !prompt.trim() ? 0.5 : 1,
                    transition: 'opacity 0.2s, transform 0.1s',
                    boxShadow: isGenerating || !prompt.trim() ? 'none' : '0 2px 12px rgba(108,99,255,0.3)',
                    letterSpacing: '0.3px',
                  }}
                >
                  {isGenerating ? '⏳ Se generează...' : '🚀 Generare Video'}
                </button>

                {error && (
                  <div style={{
                    marginTop: 12, padding: 10, background: '#2d1111',
                    border: '1px solid var(--error)', borderRadius: 8, color: 'var(--error)',
                    fontSize: 13,
                  }}>
                    ❌ {error}
                  </div>
                )}

                {isGenerating && status && (
                  <div style={{ marginTop: 12, padding: 10, background: '#111a2d', borderRadius: 8, fontSize: 13 }}>
                    ⏳ Status: <strong>{status.status}</strong>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right panel — preview */}
          <div style={{ flex: '1.3 1 440px', minWidth: 320 }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, minHeight: 400,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: mode === 'preview' ? 0 : 24, position: 'relative',
                minHeight: 300,
              }}>
                {mode === 'idle' && (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Descrie videoclipul și apasă Generare<br />
                    <span style={{ fontSize: 12 }}>Previzualizare, editare și descărcare</span>
                  </p>
                )}
                {mode === 'generating' && (
                  <div style={{ textAlign: 'left', width: '100%', padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 32, height: 32, flexShrink: 0,
                        border: '3px solid var(--border)',
                        borderTopColor: 'var(--accent)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{status?.progress?.message || 'Se lucrează...'}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {status?.progress?.pct ? `${status.progress.pct}%` : 'Se pornește...'}
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {timelineSteps.map(s => {
                        const currentStep = status?.progress?.step || '';
                        const currentGroup = stepGroups[currentStep] ?? -1;
                        const stepIdx = stepOrder.indexOf(s.step);
                        const done = currentGroup > stepIdx;
                        const active = currentGroup === stepIdx;

                        // Debug info for current step
                        let debugContent = null;
                        if (isDebug && active && status?.debugInfo) {
                          const di = status.debugInfo;
                          if (s.step === 'generating_composition') {
                            if (di.composition_html) {
                              debugContent = (
                                <div style={{ marginTop: 6, padding: '6px 8px', background: '#0a0a1a', borderRadius: 4, fontSize: 10, maxHeight: 120, overflowY: 'auto', lineHeight: 1.3 }}>
                                  <div style={{ color: 'var(--accent)', marginBottom: 3, fontWeight: 600 }}>🧬 HTML Composition</div>
                                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#aaa' }}>{di.composition_html.substring(0, 2000)}</pre>
                                  {di.composition_html.length > 2000 && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>... ({di.composition_html.length} chars total)</div>}
                                </div>
                              );
                            }
                            if (di.auto_narration) {
                              const audioDebug = (
                                <div style={{ marginTop: 6, padding: '6px 8px', background: '#0a0a1a', borderRadius: 4, fontSize: 11 }}>
                                  <div style={{ color: 'var(--accent)', marginBottom: 3, fontWeight: 600 }}>🎙️ Auto-narration</div>
                                  <span style={{ color: '#aaa' }}>"{di.auto_narration}"</span>
                                </div>
                              );
                              debugContent = debugContent ? (
                                <>{debugContent}{audioDebug}</>
                              ) : audioDebug;
                            }
                          } else if (s.step === 'validating' && di.lint) {
                            debugContent = (
                              <div style={{ marginTop: 6, padding: '6px 8px', background: '#0a0a1a', borderRadius: 4, fontSize: 10 }}>
                                <div style={{ color: di.lint.ok ? 'var(--success)' : 'var(--error)', marginBottom: 3, fontWeight: 600 }}>
                                  {di.lint.ok ? '✅ Lint passed' : '⚠️ Lint warnings'}
                                </div>
                                {di.lint.errors && <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#aaa' }}>{di.lint.errors}</pre>}
                              </div>
                            );
                          } else if (s.step === 'rendering_video' && di.render) {
                            debugContent = (
                              <div style={{ marginTop: 6, padding: '6px 8px', background: '#0a0a1a', borderRadius: 4, fontSize: 10 }}>
                                <div style={{ color: di.render.ok ? 'var(--success)' : 'var(--error)', fontWeight: 600 }}>
                                  {di.render.ok ? '✅ Render OK' : '❌ Render failed'}
                                </div>
                                {di.render.path && <div style={{ color: '#aaa', marginTop: 2 }}>📁 {di.render.path}</div>}
                              </div>
                            );
                          }
                        }

                        return (
                          <div key={s.step} style={{
                            display: 'flex', flexDirection: 'column',
                            padding: '6px 10px', borderRadius: 6,
                            background: active ? 'rgba(108,99,255,0.12)' : 'transparent',
                            opacity: done ? 0.8 : active ? 1 : 0.4,
                            fontSize: 13,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14 }}>{active ? '⏳' : done ? '✅' : '○'}</span>
                              <span style={{
                                flex: 1, fontWeight: active ? 600 : 400,
                                color: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--text-secondary)',
                              }}>{s.label}</span>
                              {active && <div style={{
                                width: 12, height: 12,
                                border: '2px solid var(--accent)',
                                borderTopColor: 'transparent',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                              }} />}
                              {done && <span style={{ color: 'var(--success)', fontSize: 11 }}>✓</span>}
                            </div>
                            {debugContent}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
                  <div style={{ width: '100%', position: 'relative' }}>
                    <video
                      key={videoId}
                      controls
                      playsInline
                      style={{
                        width: '100%', display: 'block',
                        borderTopLeftRadius: 12, borderTopRightRadius: 12,
                        background: '#000', maxHeight: 450,
                      }}
                    >
                      <source src={`${API}/api/video/${videoId}/download`} type="video/mp4" />
                    </video>
                  </div>
                )}
                {mode === 'preview' && ((status || historyStatus)?.status === 'failed') && (
                  <div style={{ textAlign: 'center', color: 'var(--error)' }}>
                    ❌ Generare eșuată<br />
                    <span style={{ fontSize: 12 }}>{(status || historyStatus)?.error}</span>
                    <br />
                    <button onClick={() => setMode('idle')} style={{
                      marginTop: 12, padding: '8px 16px', cursor: 'pointer',
                      background: 'var(--surface)', color: 'var(--text)',
                      border: '1px solid var(--border)', borderRadius: 6,
                    }}>Încearcă din nou</button>
                  </div>
                )}
              </div>

              {/* Action bar */}
              {mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
                <div style={{
                  display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)',
                  flexWrap: 'wrap',
                }}>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `${API}/api/video/${videoId}/download`;
                      a.download = `www2video-${videoId?.slice(0, 8)}.mp4`;
                      a.click();
                    }}
                    style={{
                      flex: '1 1 auto', padding: '10px 14px', background: 'linear-gradient(135deg, #1a3a1a, #2a5a2a)',
                      border: '1px solid var(--success)', borderRadius: 8,
                      color: 'var(--success)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      transition: 'all 0.15s',
                    }}
                  >
                    ⬇ Descarcă MP4
                  </button>
                  <button
                    onClick={() => {
                      const url = `${API}/api/video/${videoId}/download`;
                      navigator.clipboard.writeText(url).then(() => {
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      });
                    }}
                    style={{
                      flex: '1 1 auto', padding: '10px 14px', background: 'linear-gradient(135deg, #1a2a3a, #1a3a3a)',
                      border: '1px solid var(--accent)', borderRadius: 8,
                      color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      transition: 'all 0.15s',
                    }}
                  >
                    {copiedUrl ? '✅ Copiat!' : '📋 Copy URL'}
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={!prompt.trim()}
                    style={{
                      flex: '1 1 auto', padding: '10px 14px', background: 'linear-gradient(135deg, #2a1a1a, #3a1a1a)',
                      border: '1px solid #ff6b6b', borderRadius: 8,
                      color: '#ff6b6b', cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      transition: 'all 0.15s',
                      opacity: !prompt.trim() ? 0.5 : 1,
                    }}
                  >
                    🔄 Regenerare
                  </button>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                      flex: '1 1 auto', padding: '10px 14px',
                      background: showDetails ? 'rgba(108,99,255,0.12)' : '#111',
                      border: `1px solid ${showDetails ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8,
                      color: showDetails ? 'var(--accent)' : 'var(--text-secondary)',
                      cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      transition: 'all 0.15s',
                    }}
                  >
                    {showDetails ? '🔍 Ascunde Detalii' : '🔍 Detalii'}
                  </button>
                </div>
              )}

              {/* Details panel — dropdown-style toggle */}
              {showDetails && mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
                <div style={{
                  borderTop: '1px solid var(--border)', fontSize: 12,
                  background: '#0a0a18',
                }}>
                  <div style={{ padding: '10px 14px' }}>
                    {/* Video ID */}
                    <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>Video ID:</span>
                      <code style={{ color: 'var(--accent)', fontSize: 11, background: '#111', padding: '2px 8px', borderRadius: 4 }}>{videoId}</code>
                    </div>

                    {/* Composition HTML (from debugInfo, first 500 chars) */}
                    {(status || historyStatus)?.debugInfo?.composition_html && (
                      <details style={{ marginBottom: 6 }} open>
                        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: '6px 0' }}>
                          🧬 HTML Composition
                        </summary>
                        <pre style={{
                          background: '#111', padding: 8, borderRadius: 6,
                          marginTop: 4, fontSize: 10, overflowX: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 150, overflowY: 'auto', lineHeight: 1.3,
                        }}>{(status || historyStatus).debugInfo.composition_html.substring(0, 500)}</pre>
                        {(status || historyStatus).debugInfo.composition_html.length > 500 && (
                          <span style={{ color: 'var(--text-secondary)', marginTop: 2, display: 'block', fontSize: 10 }}>
                            ... ({(status || historyStatus).debugInfo.composition_html.length} chars total)
                          </span>
                        )}
                      </details>
                    )}

                    {/* Audio narration (if exists) */}
                    {(status || historyStatus)?.debugInfo?.auto_narration && (
                      <details style={{ marginBottom: 6 }} open>
                        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: '6px 0' }}>
                          🎙️ Audio Narration
                        </summary>
                        <pre style={{
                          background: '#111', padding: 8, borderRadius: 6,
                          marginTop: 4, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 100, overflowY: 'auto',
                        }}>{(status || historyStatus).debugInfo.auto_narration}</pre>
                      </details>
                    )}

                    {/* Lint result */}
                    {(status || historyStatus)?.debugInfo?.lint && (
                      <details style={{ marginBottom: 6 }} open>
                        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: '6px 0' }}>
                          🔍 Lint:{' '}
                          <span style={{ color: (status || historyStatus).debugInfo.lint.ok ? 'var(--success)' : 'var(--error)' }}>
                            {(status || historyStatus).debugInfo.lint.ok ? '✅ Passed' : '⚠️ Warnings'}
                          </span>
                        </summary>
                        {(status || historyStatus).debugInfo.lint.errors && (
                          <pre style={{
                            background: '#111', padding: 8, borderRadius: 6,
                            marginTop: 4, fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 100, overflowY: 'auto',
                          }}>{(status || historyStatus).debugInfo.lint.errors}</pre>
                        )}
                      </details>
                    )}

                    {/* Render status + path */}
                    {(status || historyStatus)?.debugInfo?.render && (
                      <details style={{ marginBottom: 6 }} open>
                        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: '6px 0' }}>
                          🎬 Render:{' '}
                          <span style={{ color: (status || historyStatus).debugInfo.render.ok ? 'var(--success)' : 'var(--error)' }}>
                            {(status || historyStatus).debugInfo.render.ok ? '✅ OK' : '❌ Failed'}
                          </span>
                        </summary>
                        {(status || historyStatus).debugInfo.render.path && (
                          <div style={{ marginTop: 2, color: '#aaa', fontSize: 10, padding: '0 0 4px' }}>
                            📁 {String((status || historyStatus).debugInfo.render.path).substring(0, 120)}
                          </div>
                        )}
                      </details>
                    )}

                    {/* Prompt (from status or historyStatus) */}
                    {(status || historyStatus)?.prompt && (
                      <details style={{ marginBottom: 6 }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: 600, fontSize: 12, padding: '6px 0' }}>
                          📝 Prompt
                        </summary>
                        <pre style={{
                          background: '#111', padding: 8, borderRadius: 6,
                          marginTop: 4, fontSize: 11, overflowX: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 100, overflowY: 'auto',
                        }}>{(status || historyStatus)?.prompt || 'N/A'}</pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History — per-user, localStorage */}
        {history.length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-secondary)', marginBottom: 12 }}>
              📋 Istoric ({history.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(0, 10).map(v => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: '#111', borderRadius: 8,
                  cursor: v.status === 'ready' || v.status === 'failed' ? 'pointer' : 'default',
                  fontSize: 12, transition: 'background 0.12s',
                }}
                  onClick={() => loadHistoryVideo(v)}
                  onMouseOver={e => {
                    if (v.status === 'ready' || v.status === 'failed') e.currentTarget.style.background = '#1a1a2e';
                  }}
                  onMouseOut={e => e.currentTarget.style.background = '#111'}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: v.status === 'ready' ? 'var(--success)' : v.status === 'failed' ? 'var(--error)' : '#ffa500',
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {v.prompt}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {v.duration || '?'}s
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                  {v.status === 'ready' && (
                    <span style={{ fontSize: 10, color: 'var(--success)' }}>gata</span>
                  )}
                  {v.status === 'failed' && (
                    <span style={{ fontSize: 10, color: 'var(--error)' }}>eșuat</span>
                  )}
                  {v.useAudio && <span style={{ fontSize: 10, color: 'var(--accent)' }}>🎵</span>}
                  {v.useSubtitles && <span style={{ fontSize: 10 }}>📝</span>}
                  {v.useWebsite && <span style={{ fontSize: 10 }}>🌐</span>}
                  <button
                    onClick={(e) => handleDeleteHistory(e, v.id)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4,
                      lineHeight: 1, flexShrink: 0,
                    }}
                    onMouseOver={e => e.target.style.color = 'var(--error)'}
                    onMouseOut={e => e.target.style.color = 'var(--text-secondary)'}
                    title="Șterge din istoric"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:hover { filter: brightness(1.15); }
        textarea:focus, input:focus, select:focus { outline: none; border-color: var(--accent) !important; }
        summary { cursor: pointer; }
        summary::-webkit-details-marker { color: var(--accent); }
        details[open] > summary { margin-bottom: 4px; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>
    </div>
  );
}
