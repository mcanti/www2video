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

        // Trigger onReady for both final states and composition_ready (preview step)
        if (data.status === 'ready' || data.status === 'failed' || data.status === 'composition_ready') {
          if (onReady) onReady(data);
          // Only stop polling for truly terminal states
          if (data.status === 'ready' || data.status === 'failed') return;
          // For composition_ready, continue polling (user may trigger render)
        }
        // If status is 'rendering', keep polling until ready/failed
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

// ========== COLLAPSIBLE SECTION COMPONENTS ==========
// MUST be outside Generator to avoid remount on every keystroke

const SectionHeader = ({ icon, title, section, expanded, onToggle }) => (
  <div
    onClick={() => onToggle(section)}
    style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
      transition: 'background 0.15s',
      borderRadius: expanded ? '10px 10px 0 0' : 10,
      background: expanded ? 'rgba(108,99,255,0.06)' : 'transparent',
    }}
    onMouseOver={e => { if (!expanded) e.currentTarget.style.background = 'rgba(108,99,255,0.04)'; }}
    onMouseOut={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ fontSize: 16 }}>{icon}</span>
    <span style={{
      flex: 1, fontSize: 14, fontWeight: 600,
      color: expanded ? 'var(--accent)' : 'var(--text)',
      transition: 'color 0.2s',
    }}>
      {title}
    </span>
    <span style={{
      fontSize: 12, color: 'var(--text-secondary)',
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
    maxHeight: expanded ? 600 : 0, overflow: 'hidden',
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
  const [mode, setMode] = useState('idle'); // idle | generating | preview_composition | rendering | preview | error
  const [history, setHistory] = useState(loadHistory);
  const [error, setError] = useState('');
  const [historyStatus, setHistoryStatus] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugHtml, setDebugHtml] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const previewRef = useRef(null);

  const [expandedSections, setExpandedSections] = useState({
    content: true, technical: false, audio: false, advanced: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isDebug = window.location.search.includes('debug=true');

  // When polling detects a terminal or composition-ready status
  const handlePollReady = (data) => {
    // Update history status
    if (data.status === 'composition_ready' || data.status === 'ready' || data.status === 'failed') {
      const list = loadHistory();
      const idx = list.findIndex(item => item.id === videoId);
      if (idx !== -1 && list[idx].status !== 'ready' && list[idx].status !== 'failed') {
        list[idx].status = data.status;
        localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
        setHistory(loadHistory());
      }
    }

    if (data.status === 'composition_ready') {
      setMode('preview_composition');
    } else if (data.status === 'ready') {
      setMode('preview');
    } else if (data.status === 'failed') {
      setError(data.error || 'Generation failed');
      setMode('error');
    }
  };

  const status = usePollStatus(
    (mode === 'generating' || mode === 'rendering' || mode === 'preview_composition') ? videoId : null,
    handlePollReady
  );

  // Load debug info when viewing a ready video
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
    if (v.status !== 'ready' && v.status !== 'failed' && v.status !== 'composition_ready') return;
    setVideoId(v.id);
    setMode(v.status === 'composition_ready' ? 'preview_composition' : 'preview');
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
    setError('');
    try {
      const res = await fetch(`${API}/api/video/${v.id}/status`);
      const data = await res.json();
      setHistoryStatus(data);
      if (data.tts_text) { setUseAudio(true); setAudioPrompt(data.tts_text); }
      if (data.tts_voice) setVoiceName(data.tts_voice);
    } catch {}
  };

  const handleDeleteHistory = async (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    try { await fetch(`${API}/api/video/${id}`, { method: 'DELETE' }); } catch {}
    const list = loadHistory().filter(item => item.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    setHistory(loadHistory());
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;

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
      if (data.error) { setError(data.error); setMode('error'); return; }
      setVideoId(data.videoId);
      saveToHistory({ id: data.videoId, prompt: text, status: 'generating', duration, width, height, useAudio, useSubtitles, audioPrompt: audioPrompt.trim(), voiceName, useWebsite, sourceUrl: url.trim(), created_at: new Date().toISOString() });
      setHistory(loadHistory());
    } catch (err) {
      setError(err.message);
      setMode('error');
    }
  };

  const handleRenderMP4 = async () => {
    if (!videoId) return;
    setMode('rendering');
    setError('');
    try {
      const res = await fetch(`${API}/api/video/${videoId}/render`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { setError(data.error); setMode('preview_composition'); return; }
      // Polling will pick up 'rendering' → 'ready' transition via usePollStatus
    } catch (err) {
      setError(err.message);
      setMode('preview_composition');
    }
  };

  const handleDownload = () => {
    if (!videoId) return;
    // Trigger download
    const a = document.createElement('a');
    a.href = `${API}/api/video/${videoId}/download`;
    a.download = `www2video-${videoId.slice(0, 8)}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRegenerate = () => {
    setVideoId(null);
    handleGenerate();
  };

  const loadLumiDefaults = () => {
    setPrompt(LUMI_DEFAULTS.prompt);
    setDuration(LUMI_DEFAULTS.duration);
    setUseAudio(LUMI_DEFAULTS.useAudio);
    setAudioPrompt(LUMI_DEFAULTS.audioPrompt);
    setUseWebsite(LUMI_DEFAULTS.useWebsite);
    setUrl(LUMI_DEFAULTS.sourceUrl);
  };

  const isGenerating = mode === 'generating' || mode === 'rendering';

  const timelineSteps = [
    { step: 'initializing', icon: '📁', label: 'Pregătire proiect' },
    { step: 'generating_composition', icon: '🤖', label: 'Generare conținut' },
    { step: 'writing_composition', icon: '💾', label: 'Salvare' },
    { step: 'validating', icon: '🔍', label: 'Validare' },
    { step: 'rendering_video', icon: '🎬', label: 'Generare video' },
    { step: 'finalizing', icon: '📦', label: 'Finalizare' },
  ];
  const stepGroups = {
    'queued': -1, 'initializing': 0, 'initialized': 0,
    'generating_composition': 1, 'composition_ai': 1, 'composition_done': 1,
    'generating_audio': 1, 'audio_done': 1, 'audio_skip': 1,
    'writing_composition': 2,
    'validating': 3, 'lint_warning': 3, 'validated': 3,
    'composition_ready': 3,
    'rendering_video': 4,
    'finalizing': 5,
    'fetching_website': 0, 'extracting_identity': 1, 'saving_identity': 2,
    'ready': 6, 'failed': 6,
  };

  const inputStyle = {
    width: '100%', background: '#111', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', padding: '10px 14px',
    fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };
  const selectStyle = {
    ...inputStyle, cursor: 'pointer', appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36,
  };
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'var(--text-secondary)', marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.5px',
  };
  const checkboxStyle = {
    width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0,
  };

  // Shared buttons
  const primaryBtnStyle = (disabled) => ({
    width: '100%', padding: '14px 24px',
    background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
    color: '#fff', border: 'none', borderRadius: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 16, fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
    transition: 'filter 0.15s, transform 0.1s',
  });

  const secondaryBtnStyle = {
    flex: 1, padding: '12px 20px',
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: 'var(--text-secondary)',
    transition: 'all 0.15s',
  };

  return (
    <div className="app">
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '20px 0 18px', borderBottom: '1px solid var(--border)', marginBottom: 28,
      }}>
        <img src="https://cognitum.ro/assets/logo-inv.png" style={{ height: 32, opacity: 0.85 }} alt="Cognitum" />
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            www2video
          </h1>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginTop: 1 }}>
            AI video generator
          </span>
        </div>
        {isDebug && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 12px',
            background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
            color: '#fff', borderRadius: 6, letterSpacing: '0.5px',
          }}>DEBUG</span>
        )}
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {isDebug && (
          <div style={{ background: '#1a1a2e', border: '1px solid var(--accent)', borderRadius: 12, padding: 16, opacity: 0.9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>⚙️ Debug Tools</span>
              <button onClick={loadLumiDefaults} style={{
                padding: '6px 14px', background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
                onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                onMouseOut={e => e.currentTarget.style.filter = 'none'}
              >🚀 Load lumi.bot defaults</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Use acest buton pentru a pre-popula formularul cu valori potrivite pentru un product launch video LumiBot.
            </div>
          </div>
        )}

        <div className="generator-layout" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* LEFT PANEL */}
          <div className="form-panel" style={{
            flex: '1 1 440px', minWidth: 320,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden',
          }}>
            <SectionHeader icon="📝" title="Conținut" section="content" expanded={expandedSections.content} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.content}>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Un clip de prezentare de 10 secunde pentru o cafea premium..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 100, lineHeight: 1.5 }}
              />
            </SectionBody>
            <SectionDivider />

            <SectionHeader icon="⚙️" title="Setări tehnice" section="technical" expanded={expandedSections.technical} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.technical}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 auto' }}>
                  <label style={labelStyle}>Durată (secunde)</label>
                  <input type="text" inputMode="numeric" value={duration}
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
                    style={{ ...inputStyle, width: 100, textAlign: 'center' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={labelStyle}>Rezoluție</label>
                  <select value={`${width}x${height}`}
                    onChange={e => { const [w, h] = e.target.value.split('x').map(Number); setWidth(w); setHeight(h); }}
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

            <SectionHeader icon="🎵" title="Audio" section="audio" expanded={expandedSections.audio} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.audio}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <input type="checkbox" id="chk-audio" checked={useAudio}
                  onChange={e => setUseAudio(e.target.checked)} style={checkboxStyle} />
                <label htmlFor="chk-audio" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>🎵 Audio (narare)</label>
              </div>
              {useAudio && (
                <>
                  <textarea value={audioPrompt} onChange={e => setAudioPrompt(e.target.value)}
                    placeholder="Scrie textul pe care sa-l spuna naratorul sau lasă gol și va fi generat automat un text potrivit"
                    rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 60, lineHeight: 1.5, marginBottom: 12 }} />
                  <label style={labelStyle}>Voce narator</label>
                  <select value={voiceName} onChange={e => setVoiceName(e.target.value)} style={selectStyle}>
                    {GEMINI_VOICES.map(v => (
                      <option key={v.name} value={v.name}>{v.label}</option>
                    ))}
                  </select>
                </>
              )}
            </SectionBody>
            <SectionDivider />

            <SectionHeader icon="🌐" title="Avansat" section="advanced" expanded={expandedSections.advanced} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.advanced}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: useWebsite ? 10 : 0 }}>
                <input type="checkbox" id="chk-website" checked={useWebsite}
                  onChange={e => setUseWebsite(e.target.checked)} style={checkboxStyle} />
                <label htmlFor="chk-website" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>🌐 Extrage identitate vizuală de pe site</label>
              </div>
              {useWebsite && (
                <div>
                  <label style={labelStyle}>URL site</label>
                  <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" style={inputStyle} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
                <input type="checkbox" id="chk-subs" checked={useSubtitles}
                  onChange={e => setUseSubtitles(e.target.checked)} style={checkboxStyle} />
                <label htmlFor="chk-subs" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>💬 Subtitrări</label>
              </div>
            </SectionBody>

            <div style={{ padding: '16px 20px' }}>
              <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                style={primaryBtnStyle(isGenerating || !prompt.trim())}
                onMouseOver={e => { if (!isGenerating && prompt.trim()) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
                onMouseOut={e => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                {isGenerating ? '⏳ Se generează...' : '🚀 Generare video'}
              </button>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="output-panel" style={{ flex: '1 1 480px', minWidth: 320, position: 'sticky', top: 24 }}>
            {/* History */}
            {history.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                  📋 Istoric
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {history.map(v => (
                    <div key={v.id} onClick={() => loadHistoryVideo(v)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                        cursor: (v.status === 'ready' || v.status === 'failed' || v.status === 'composition_ready') ? 'pointer' : 'default',
                        borderBottom: '1px solid var(--border)', transition: 'background 0.1s',
                        opacity: (v.status === 'ready' || v.status === 'composition_ready') ? 1 : 0.65,
                      }}
                      onMouseOver={e => { if (v.status === 'ready' || v.status === 'failed' || v.status === 'composition_ready') e.currentTarget.style.background = 'rgba(108,99,255,0.08)'; }}
                      onMouseOut={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', minWidth: 38,
                        color: v.status === 'ready' ? '#4ade80' : v.status === 'composition_ready' ? '#60a5fa' : v.status === 'failed' ? '#f87171' : '#fbbf24',
                      }}>
                        {v.status === 'ready' ? '✅' : v.status === 'composition_ready' ? '👁️' : v.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                        {v.prompt}
                      </span>
                      <button onClick={(e) => handleDeleteHistory(e, v.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4, opacity: 0.5 }}
                        onMouseOver={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#f87171'; }}
                        onMouseOut={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        title="Șterge">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generating state (composition phase) */}
            {mode === 'generating' && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
                }} />
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                  {status?.step === 'fetching_website' ? '🌐 Se extrage identitatea vizuală...'
                    : status?.step === 'generating_composition' ? '🤖 Se generează conținutul...'
                    : status?.step === 'generating_audio' ? '🎵 Se generează nararea audio...'
                    : '⏳ Se pregătește...'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12 }}>
                  {timelineSteps.slice(0, 4).map((s, i) => {
                    const currentStep = status?.step ? (stepGroups[status.step] ?? -1) : -1;
                    const done = currentStep > i;
                    const active = currentStep === i;
                    return (
                      <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: done || active ? 20 : 12, height: 4, borderRadius: 2,
                          background: done ? 'linear-gradient(90deg, var(--accent), #a78bfa)' : active ? 'var(--accent)' : 'var(--border)',
                          transition: 'all 0.3s',
                        }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Composition ready — HTML preview */}
            {mode === 'preview_composition' && videoId && (
              <div>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  {historyStatus && (
                    <div style={{ padding: '12px 20px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {historyStatus.tts_text && <div style={{ marginBottom: 8 }}><strong>Narare:</strong> {historyStatus.tts_text}</div>}
                      {historyStatus.tts_voice && <div style={{ marginBottom: 8 }}><strong>Voce:</strong> {historyStatus.tts_voice}</div>}
                    </div>
                  )}
                  <div style={{ padding: 20 }}>
                    <iframe
                      src={`${API}/api/video/${videoId}/preview`}
                      style={{
                        width: '100%', borderRadius: 10, background: '#000',
                        aspectRatio: `${width}/${height}`, maxHeight: 400, border: 0,
                      }}
                      title="Composition preview"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
                    <button onClick={handleRenderMP4}
                      style={{
                        flex: 1, padding: '12px 20px',
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: '#fff', border: 'none', borderRadius: 10,
                        cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        transition: 'filter 0.15s',
                      }}
                      onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                      onMouseOut={e => e.currentTarget.style.filter = 'none'}
                    >
                      ⬇️ Download MP4
                    </button>
                    <button onClick={handleRegenerate}
                      style={secondaryBtnStyle}
                    >🔄 Regenerare</button>
                  </div>
                  {error && (
                    <div style={{ padding: '0 20px 16px', fontSize: 13, color: '#f87171' }}>
                      ❌ {error}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rendering MP4 state */}
            {mode === 'rendering' && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: '#22c55e',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
                }} />
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                  🎬 Se generează videoclipul MP4...
                </div>
                <div style={{
                  height: 4, background: 'var(--border)', borderRadius: 2,
                  marginTop: 12, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: '60%', borderRadius: 2,
                    background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                    animation: 'shimmer 2s infinite',
                  }} />
                </div>
                <style>{`@keyframes shimmer { 0% { width: 20%; } 50% { width: 70%; } 100% { width: 20%; } }`}</style>
              </div>
            )}

            {/* Preview — MP4 ready */}
            {(mode === 'preview') && videoId && (
              <div>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 14, overflow: 'hidden',
                }}>
                  {historyStatus && (
                    <div style={{ padding: '12px 20px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {historyStatus.tts_text && <div style={{ marginBottom: 8 }}><strong>Narare:</strong> {historyStatus.tts_text}</div>}
                      {historyStatus.tts_voice && <div style={{ marginBottom: 8 }}><strong>Voce:</strong> {historyStatus.tts_voice}</div>}
                    </div>
                  )}
                  <div style={{ padding: 20 }}>
                    <video ref={previewRef} controls autoPlay
                      style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 400 }}>
                      <source src={`${API}/api/video/${videoId}/download`} type="video/mp4" />
                    </video>
                  </div>
                  <div style={{ display: 'flex', gap: 10, padding: '0 20px 20px' }}>
                    <button onClick={handleDownload}
                      style={{
                        flex: 1, padding: '12px 20px',
                        background: 'linear-gradient(135deg, var(--accent), #a78bfa)',
                        color: '#fff', border: 'none', borderRadius: 10,
                        cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        transition: 'filter 0.15s',
                      }}
                      onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                      onMouseOut={e => e.currentTarget.style.filter = 'none'}
                    >⬇️ Download MP4</button>
                    <button onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/video/${videoId}/download`);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 2000);
                    }}
                      style={{
                        padding: '12px 20px', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 10,
                        cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        color: copiedUrl ? '#4ade80' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >{copiedUrl ? '✅ Copiat!' : '📋 Copy URL'}</button>
                  </div>
                </div>

                {error && (
                  <div style={{
                    marginTop: 12, padding: '12px 16px',
                    background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
                    borderRadius: 10, color: '#f87171', fontSize: 13,
                  }}>
                    ❌ {error}
                  </div>
                )}

                {(isDebug || debugOpen) && debugHtml && (
                  <div style={{ marginTop: 12 }}>
                    <button onClick={() => setShowDetails(prev => !prev)}
                      style={{
                        width: '100%', padding: '8px 16px', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left',
                      }}
                    >🔍 {showDetails ? 'Ascunde' : 'Arată'} compoziția generată</button>
                    {showDetails && (
                      <div style={{
                        marginTop: 8, padding: 16, background: '#0d0d0d',
                        border: '1px solid var(--border)', borderRadius: 10,
                        maxHeight: 400, overflow: 'auto', fontSize: 12, color: '#aaa',
                        fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                      }}>{debugHtml}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
