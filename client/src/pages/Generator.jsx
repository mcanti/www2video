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

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    content: true,
    technical: false,
    audio: false,
    advanced: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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

  // ========== SHARED INLINE STYLES ==========
  const inputStyle = {
    width: '100%',
    background: '#111',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '10px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  };

  const labelStyle = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const checkboxStyle = {
    width: 18,
    height: 18,
    accentColor: 'var(--accent)',
    cursor: 'pointer',
    flexShrink: 0,
  };

  // ========== COLLAPSIBLE SECTION COMPONENT ==========
  const SectionHeader = ({ icon, title, section, expanded }) => (
    <div
      onClick={() => toggleSection(section)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 0.15s',
        borderRadius: expanded ? '10px 10px 0 0' : 10,
        background: expanded ? 'rgba(108,99,255,0.06)' : 'transparent',
      }}
      onMouseOver={e => {
        if (!expanded) e.currentTarget.style.background = 'rgba(108,99,255,0.04)';
      }}
      onMouseOut={e => {
        if (!expanded) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{
        flex: 1,
        fontSize: 14,
        fontWeight: 600,
        color: expanded ? 'var(--accent)' : 'var(--text)',
        transition: 'color 0.2s',
      }}>
        {title}
      </span>
      <span style={{
        fontSize: 12,
        color: 'var(--text-secondary)',
        transition: 'transform 0.25s ease',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        display: 'inline-block',
      }}>
        ▼
      </span>
    </div>
  );

  const SectionBody = ({ expanded, children }) => (
    <div style={{
      maxHeight: expanded ? 600 : 0,
      overflow: 'hidden',
      transition: 'max-height 0.35s ease, opacity 0.25s ease, padding 0.25s ease',
      opacity: expanded ? 1 : 0,
    }}>
      <div style={{ padding: expanded ? '4px 20px 18px' : '0 20px' }}>
        {children}
      </div>
    </div>
  );

  const SectionDivider = () => (
    <div style={{ height: 1, background: 'var(--border)', margin: '0 20px', opacity: 0.4 }} />
  );

  return (
    <div className="app">
      {/* ====== HEADER ====== */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '20px 0 18px',
        borderBottom: '1px solid var(--border)',
        marginBottom: 28,
      }}>
        <img
          src="https://cognitum.ro/assets/logo-inv.png"
          style={{ height: 32, opacity: 0.85 }}
          alt="Cognitum"
        />
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.4px',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            www2video
          </h1>
          <span style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            display: 'block',
            marginTop: 1,
          }}>
            AI video generator
          </span>
        </div>
        {isDebug && (
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 12px',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            color: '#fff',
            borderRadius: 6,
            letterSpacing: '0.5px',
          }}>
            DEBUG
          </span>
        )}
      </header>

      {/* ====== MAIN LAYOUT ====== */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Debug feature flag toggle */}
        {isDebug && (
          <div style={{
            background: '#1a1a2e',
            border: '1px solid var(--accent)',
            borderRadius: 12,
            padding: 16,
            opacity: 0.9,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>⚙️ Debug Tools</span>
              <button
                onClick={loadLumiDefaults}
                style={{
                  padding: '6px 14px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  transition: 'filter 0.15s, transform 0.1s',
                }}
                onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                onMouseOut={e => e.currentTarget.style.filter = 'none'}
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

        {/* Two-column row */}
        <div className="generator-layout" style={{
          display: 'flex',
          gap: 24,
          alignItems: 'flex-start',
        }}>
          {/* ====== LEFT PANEL: FORM ====== */}
          <div className="form-panel" style={{
            flex: '1 1 440px',
            minWidth: 320,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {/* Section 1: Conținut */}
            <SectionHeader icon="📝" title="Conținut" section="content" expanded={expandedSections.content} />
            <SectionBody expanded={expandedSections.content}>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Un clip de prezentare de 10 secunde pentru o cafea premium..."
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  minHeight: 100,
                  lineHeight: 1.5,
                }}
              />
            </SectionBody>

            <SectionDivider />

            {/* Section 2: Setări tehnice */}
            <SectionHeader icon="⚙️" title="Setări tehnice" section="technical" expanded={expandedSections.technical} />
            <SectionBody expanded={expandedSections.technical}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <label style={labelStyle}>Durată (secunde)</label>
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
                      ...inputStyle,
                      width: 100,
                      textAlign: 'center',
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>Rezoluție</label>
                  <select
                    value={`${width}x${height}`}
                    onChange={e => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      setWidth(w);
                      setHeight(h);
                    }}
                    style={selectStyle}
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
            </SectionBody>

            <SectionDivider />

            {/* Section 3: Audio */}
            <SectionHeader icon="🎵" title="Audio" section="audio" expanded={expandedSections.audio} />
            <SectionBody expanded={expandedSections.audio}>
              {/* Audio toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  id="chk-audio"
                  checked={useAudio}
                  onChange={e => setUseAudio(e.target.checked)}
                  style={checkboxStyle}
                />
                <label htmlFor="chk-audio" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  🎵 Audio (narare)
                </label>
              </div>

              {useAudio && (
                <>
                  <label style={labelStyle}>Text narare</label>
                  <textarea
                    value={audioPrompt}
                    onChange={e => setAudioPrompt(e.target.value)}
                    placeholder="Scrie textul pe care sa-l spuna naratorul sau lasă gol și va fi generat automat un text potrivit"
                    rows={3}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      marginBottom: 14,
                      lineHeight: 1.5,
                    }}
                  />

                  <label style={labelStyle}>Voce narator</label>
                  <select
                    value={voiceName}
                    onChange={e => setVoiceName(e.target.value)}
                    style={selectStyle}
                  >
                    {GEMINI_VOICES.map(v => (
                      <option key={v.name} value={v.name}>{v.label}</option>
                    ))}
                  </select>
                </>
              )}

              {/* Subtitles toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: useAudio ? 14 : 0,
                paddingTop: useAudio ? 12 : 0,
                borderTop: useAudio ? '1px solid var(--border)' : 'none',
              }}>
                <input
                  type="checkbox"
                  id="chk-subtitles"
                  checked={useSubtitles}
                  onChange={e => setUseSubtitles(e.target.checked)}
                  style={checkboxStyle}
                />
                <label htmlFor="chk-subtitles" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  📝 Subtitles
                </label>
              </div>
            </SectionBody>

            <SectionDivider />

            {/* Section 4: Avansat */}
            <SectionHeader icon="🌐" title="Avansat" section="advanced" expanded={expandedSections.advanced} />
            <SectionBody expanded={expandedSections.advanced}>
              {/* From website checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: useWebsite ? 10 : 0 }}>
                <input
                  type="checkbox"
                  id="chk-website"
                  checked={useWebsite}
                  onChange={e => setUseWebsite(e.target.checked)}
                  style={checkboxStyle}
                />
                <label htmlFor="chk-website" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  🌐 From website
                </label>
              </div>
              {useWebsite && (
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={inputStyle}
                />
              )}
            </SectionBody>

            {/* Generate button */}
            <div style={{ padding: '20px' }}>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                style={{
                  width: '100%',
                  padding: '15px 24px',
                  background: isGenerating || !prompt.trim()
                    ? 'var(--surface)'
                    : 'linear-gradient(135deg, #6c63ff 0%, #a78bfa 50%, #7c3aed 100%)',
                  color: '#fff',
                  border: isGenerating || !prompt.trim()
                    ? '1px solid var(--border)'
                    : 'none',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: isGenerating || !prompt.trim() ? 'not-allowed' : 'pointer',
                  opacity: isGenerating || !prompt.trim() ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: isGenerating || !prompt.trim()
                    ? 'none'
                    : '0 4px 20px rgba(108,99,255,0.35)',
                  letterSpacing: '0.3px',
                  transform: isGenerating || !prompt.trim() ? 'none' : 'translateY(0)',
                }}
                onMouseOver={e => {
                  if (!isGenerating && prompt.trim()) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 28px rgba(108,99,255,0.45)';
                  }
                }}
                onMouseOut={e => {
                  if (!isGenerating && prompt.trim()) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(108,99,255,0.35)';
                  }
                }}
              >
                {isGenerating ? '⏳ Se generează...' : '🚀 Generare Video'}
              </button>

              {error && (
                <div style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid var(--error)',
                  borderRadius: 10,
                  color: 'var(--error)',
                  fontSize: 13,
                }}>
                  ❌ {error}
                </div>
              )}

              {isGenerating && status && (
                <div style={{
                  marginTop: 12,
                  padding: 10,
                  background: 'rgba(108,99,255,0.08)',
                  borderRadius: 8,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    border: '2px solid var(--accent)',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0,
                  }} />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Status: <strong style={{ color: 'var(--accent)' }}>{status.status}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ====== RIGHT PANEL: PREVIEW ====== */}
          <div className="preview-panel" style={{
            flex: '1.3 1 440px',
            minWidth: 320,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            minHeight: 400,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: mode === 'preview' ? 0 : 24,
              position: 'relative',
              minHeight: 300,
            }}>
              {mode === 'idle' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: 'rgba(108,99,255,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    fontSize: 28,
                  }}>
                    🎬
                  </div>
                  <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Descrie videoclipul și apasă Generare
                  </p>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', opacity: 0.6 }}>
                    Previzualizare, editare și descărcare
                  </span>
                </div>
              )}
              {mode === 'generating' && (
                <div style={{ textAlign: 'left', width: '100%', padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      flexShrink: 0,
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
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '7px 12px',
                          borderRadius: 8,
                          background: active ? 'rgba(108,99,255,0.1)' : 'transparent',
                          opacity: done ? 0.8 : active ? 1 : 0.4,
                          fontSize: 13,
                          transition: 'all 0.2s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontSize: 14,
                              width: 20,
                              textAlign: 'center',
                            }}>
                              {active ? '⏳' : done ? '✅' : '○'}
                            </span>
                            <span style={{
                              flex: 1,
                              fontWeight: active ? 600 : 400,
                              color: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--text-secondary)',
                            }}>{s.label}</span>
                            {active && <div style={{
                              width: 14,
                              height: 14,
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
                      width: '100%',
                      display: 'block',
                      borderTopLeftRadius: 14,
                      borderTopRightRadius: 14,
                      background: '#000',
                      maxHeight: 450,
                    }}
                  >
                    <source src={`${API}/api/video/${videoId}/download`} type="video/mp4" />
                  </video>
                </div>
              )}
              {mode === 'preview' && ((status || historyStatus)?.status === 'failed') && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <div style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'rgba(239,68,68,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                    fontSize: 24,
                  }}>
                    ❌
                  </div>
                  <div style={{ color: 'var(--error)', marginBottom: 8, fontWeight: 600 }}>
                    Generare eșuată
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {(status || historyStatus)?.error}
                  </span>
                  <br />
                  <button onClick={() => setMode('idle')} style={{
                    marginTop: 14,
                    padding: '8px 20px',
                    cursor: 'pointer',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'all 0.15s',
                  }}>
                    Încearcă din nou
                  </button>
                </div>
              )}
            </div>

            {/* Action bar */}
            {mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
              <div style={{
                display: 'flex',
                gap: 8,
                padding: 14,
                borderTop: '1px solid var(--border)',
                flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `${API}/api/video/${videoId}/download`;
                    a.download = `www2video-${videoId?.slice(0, 8)}.mp4`;
                    a.click();
                  }}
                  style={actionBtnStyle('var(--success)', 'rgba(34,197,94,0.08)')}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(34,197,94,0.14)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(34,197,94,0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
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
                  style={actionBtnStyle('var(--accent)', 'rgba(108,99,255,0.08)')}
                  onMouseOver={e => {
                    e.currentTarget.style.background = 'rgba(108,99,255,0.14)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(108,99,255,0.06)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {copiedUrl ? '✅ Copiat!' : '📋 Copy URL'}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={!prompt.trim()}
                  style={actionBtnStyle('#ff6b6b', 'rgba(255,107,107,0.06)')}
                  onMouseOver={e => {
                    if (prompt.trim()) {
                      e.currentTarget.style.background = 'rgba(255,107,107,0.12)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = 'rgba(255,107,107,0.04)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🔄 Regenerare
                </button>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  style={{
                    ...actionBtnStyle(
                      showDetails ? 'var(--accent)' : 'var(--text-secondary)',
                      showDetails ? 'rgba(108,99,255,0.08)' : 'transparent'
                    ),
                    border: `1px solid ${showDetails ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.background = showDetails ? 'rgba(108,99,255,0.14)' : 'rgba(255,255,255,0.04)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = showDetails ? 'rgba(108,99,255,0.08)' : 'transparent';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {showDetails ? '🔍 Ascunde Detalii' : '🔍 Detalii'}
                </button>
              </div>
            )}

            {/* Details panel — dropdown-style toggle */}
            {showDetails && mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
              <div style={{
                borderTop: '1px solid var(--border)',
                fontSize: 12,
                background: '#0a0a18',
                animation: 'slideDown 0.2s ease',
              }}>
                <div style={{ padding: '12px 16px' }}>
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

        {/* ====== HISTORY ====== */}
        {history.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '16px 20px',
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}>
              📋 Istoric ({history.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(0, 10).map(v => (
                <div key={v.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: '#111',
                  borderRadius: 10,
                  cursor: v.status === 'ready' || v.status === 'failed' ? 'pointer' : 'default',
                  fontSize: 12,
                  transition: 'background 0.15s, transform 0.1s',
                }}
                  onClick={() => loadHistoryVideo(v)}
                  onMouseOver={e => {
                    if (v.status === 'ready' || v.status === 'failed') {
                      e.currentTarget.style.background = '#1a1a2e';
                      e.currentTarget.style.transform = 'translateX(2px)';
                    }
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = '#111';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: v.status === 'ready' ? 'var(--success)' : v.status === 'failed' ? 'var(--error)' : '#ffa500',
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${v.status === 'ready' ? 'rgba(34,197,94,0.4)' : v.status === 'failed' ? 'rgba(239,68,68,0.4)' : 'rgba(255,165,0,0.4)'}`,
                  }} />
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                  }}>
                    {v.prompt}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {v.duration || '?'}s
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10, whiteSpace: 'nowrap' }}>
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                  {v.status === 'ready' && (
                    <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>gata</span>
                  )}
                  {v.status === 'failed' && (
                    <span style={{ fontSize: 10, color: 'var(--error)', fontWeight: 600 }}>eșuat</span>
                  )}
                  {v.useAudio && <span style={{ fontSize: 10, color: 'var(--accent)' }}>🎵</span>}
                  {v.useSubtitles && <span style={{ fontSize: 10 }}>📝</span>}
                  {v.useWebsite && <span style={{ fontSize: 10 }}>🌐</span>}
                  <button
                    onClick={(e) => handleDeleteHistory(e, v.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '4px 8px',
                      borderRadius: 6,
                      lineHeight: 1,
                      flexShrink: 0,
                      transition: 'color 0.15s, background 0.15s',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.color = 'var(--error)';
                      e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'none';
                    }}
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
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }
        
        textarea:focus, input:focus, select:focus { outline: none; border-color: var(--accent) !important; box-shadow: 0 0 0 3px rgba(108,99,255,0.15) !important; }
        summary { cursor: pointer; }
        summary::-webkit-details-marker { color: var(--accent); }
        details[open] > summary { margin-bottom: 4px; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }

        /* Responsive: stack columns on mobile */
        @media (max-width: 768px) {
          .generator-layout {
            flex-direction: column !important;
          }
          .form-panel, .preview-panel {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}

// Shared action button style helper
function actionBtnStyle(color, bg) {
  return {
    flex: '1 1 auto',
    padding: '10px 14px',
    background: bg,
    border: `1px solid ${color}`,
    borderRadius: 10,
    color,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
  };
}
