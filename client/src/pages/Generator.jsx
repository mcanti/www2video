import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Generator.module.css';

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

        if (data.status === 'ready' || data.status === 'failed' || data.status === 'composition_ready') {
          if (onReady) onReady(data);
          if (data.status === 'ready' || data.status === 'failed') return;
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

const SectionHeader = ({ icon, title, section, expanded, onToggle }) => (
  <div
    onClick={() => onToggle(section)}
    className={`${styles.sectionHeader} ${expanded ? styles.sectionHeaderExpanded : ''}`}
    role="button"
    tabIndex={0}
    aria-expanded={expanded}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(section); } }}
  >
    <span className={styles.sectionHeaderIcon}>{icon}</span>
    <span className={`${styles.sectionHeaderTitle} ${expanded ? styles.sectionHeaderTitleActive : ''}`}>
      {title}
    </span>
    <span className={`${styles.sectionHeaderChevron} ${expanded ? styles.sectionHeaderChevronOpen : ''}`}>
      ▼
    </span>
  </div>
);

const SectionBody = ({ expanded, children }) => (
  <div className={`${styles.sectionBody} ${expanded ? styles.sectionBodyOpen : ''}`}>
    <div className={styles.sectionBodyInner}>
      {children}
    </div>
  </div>
);

const SectionDivider = () => <div className={styles.sectionDivider} />;

// ========== TIME FORMATTER ==========
function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const previewRef = useRef(null);
  const playerRef = useRef(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerDuration, setPlayerDuration] = useState(0);

  // Video custom controls
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  const [expandedSections, setExpandedSections] = useState({
    content: true, technical: false, audio: false, advanced: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isDebug = window.location.search.includes('debug=true');

  // When polling detects a terminal or composition-ready status
  const handlePollReady = (data) => {
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

  // Fetch debug HTML when preview is ready
  useEffect(() => {
    if (!videoId || (mode !== 'preview' && mode !== 'preview_composition')) return;
    if (!debugOpen && !isDebug) return;
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
  }, [videoId, mode, debugOpen, isDebug]);

  // Load a video's full status and restore form fields when clicking history
  const loadHistoryVideo = async (v) => {
    setVideoId(v.id);
    if (v.status === 'generating') {
      setMode('generating');
    } else {
      setMode(v.status === 'composition_ready' ? 'preview_composition' : 'preview');
    }
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
    setHistoryExpanded(false);
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
    } catch (err) {
      setError(err.message);
      setMode('preview_composition');
    }
  };

  const handleDownload = () => {
    if (!videoId) return;
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

  // ========== VIDEO CUSTOM CONTROLS ==========
  const handleVideoPlayPause = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setVideoPlaying(true);
    } else {
      video.pause();
      setVideoPlaying(false);
    }
  }, []);

  const handleVideoRestart = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    video.currentTime = 0;
    setVideoCurrentTime(0);
    video.play();
    setVideoPlaying(true);
  }, []);

  const handleVideoTimeUpdate = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    setVideoCurrentTime(video.currentTime);
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    setVideoDuration(video.duration);
  }, []);

  // Sync video state when preview changes
  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    setVideoPlaying(!video.paused);
    setVideoCurrentTime(video.currentTime || 0);
    setVideoDuration(video.duration || 0);
  }, [mode, videoId]);

  // HyperFrames player event listeners
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onReady = (e) => {
      setPlayerReady(true);
      setPlayerDuration(e.detail?.duration || 0);
    };
    const onError = (e) => {
      console.error('[hyperframes-player] error:', e);
      setError('Eroare la încărcarea playerului');
    };

    player.addEventListener('ready', onReady);
    player.addEventListener('error', onError);
    setPlayerReady(false);
    setPlayerDuration(0);

    return () => {
      player.removeEventListener('ready', onReady);
      player.removeEventListener('error', onError);
    };
  }, [mode, videoId]);

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

  const historyStatusIcon = (s) => {
    if (s === 'ready') return '✅';
    if (s === 'composition_ready') return '👁️';
    if (s === 'failed') return '❌';
    return '⏳';
  };

  const canInteract = (s) => s === 'ready' || s === 'failed' || s === 'composition_ready';

  const showBottomBar = mode === 'preview' || mode === 'preview_composition';

  return (
    <div className={styles.app}>
      {/* ===== HEADER ===== */}
      <header className={styles.header}>
        <img
          src="/assets/logo-inv.png"
          className={styles.headerLogo}
          alt="Cognitum"
        />
        <div className={styles.headerContent}>
          <h1 className={styles.headerTitle}>www2video</h1>
          <span className={styles.headerSubtitle}>AI video generator</span>
        </div>
        <div className={styles.headerActions}>
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className={`${styles.headerBtn} ${debugOpen ? styles.headerBtnActive : ''}`}
            title={debugOpen ? 'Ascunde debug' : 'Arată debug'}
            aria-label={debugOpen ? 'Ascunde panoul de debug' : 'Arată panoul de debug'}
          >
            🔍 Debug
          </button>
          {isDebug && <span className={styles.debugBadge}>DEBUG</span>}
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main className={styles.main}>
        {/* Debug quick-load (when ?debug=true) */}
        {isDebug && (
          <div className={styles.debugPanel}>
            <div className={styles.debugHeader}>
              <span className={styles.debugTitle}>⚙️ Debug Tools</span>
              <button onClick={loadLumiDefaults} className={styles.debugBtn}>
                🚀 Load lumi.bot defaults
              </button>
            </div>
            <div className={styles.debugText}>
              Use acest buton pentru a pre-popula formularul cu valori potrivite pentru un product launch video LumiBot.
            </div>
          </div>
        )}

        {/* Debug panel (UI toggle) */}
        {debugOpen && (
          <div className={styles.debugInfoPanel}>
            <div className={styles.debugInfoHeader}>
              <span className={styles.debugInfoTitle}>🔍 Debug Info</span>
              <button onClick={() => setDebugOpen(false)} className={styles.debugClose} aria-label="Închide debug">
                ✕
              </button>
            </div>
            <div className={styles.debugInfoBody}>
              {videoId ? (
                <>
                  <div className={styles.debugInfoSection}>
                    <div className={styles.debugInfoLabel}>Video ID</div>
                    <div className={styles.debugInfoValue}>{videoId}</div>
                  </div>
                  <div className={styles.debugInfoSection}>
                    <div className={styles.debugInfoLabel}>Mode</div>
                    <div className={styles.debugInfoValue}>{mode}</div>
                  </div>
                  {status && (
                    <div className={styles.debugInfoSection}>
                      <div className={styles.debugInfoLabel}>Status</div>
                      <pre className={styles.debugInfoPre}>{JSON.stringify(status, null, 2)}</pre>
                    </div>
                  )}
                  {debugHtml && (
                    <div className={styles.debugInfoSection}>
                      <div className={styles.debugInfoLabel}>HTML Compoziție</div>
                      <button
                        onClick={() => setShowDetails(prev => !prev)}
                        className={styles.debugToggle}
                      >
                        {showDetails ? '▲ Ascunde' : '▼ Arată'} HTML ({Math.round(debugHtml.length / 1024)} KB)
                      </button>
                      {showDetails && (
                        <pre className={styles.debugInfoCode}>{debugHtml}</pre>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.debugInfoEmpty}>
                  Nicio generare activă. Pornește o generare pentru a vedea detaliile aici.
                </div>
              )}
            </div>
          </div>
        )}

        <div className={styles.layout}>
          {/* ===== LEFT PANEL: FORM ===== */}
          <div className={styles.formPanel}>
            <SectionHeader icon="📝" title="Conținut" section="content" expanded={expandedSections.content} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.content}>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Un clip de prezentare de 10 secunde pentru o cafea premium..."
                rows={4}
                className={styles.textarea}
              />
            </SectionBody>
            <SectionDivider />

            <SectionHeader icon="⚙️" title="Setări tehnice" section="technical" expanded={expandedSections.technical} onToggle={toggleSection} />
            <SectionBody expanded={expandedSections.technical}>
              <div className={styles.formRow}>
                <div className={styles.formRowItem}>
                  <label className={styles.label}>Durată (secunde)</label>
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
                    className={`${styles.input} ${styles.inputCompact}`}
                  />
                </div>
                <div className={styles.formRowItemFlex}>
                  <label className={styles.label}>Rezoluție</label>
                  <select value={`${width}x${height}`}
                    onChange={e => { const [w, h] = e.target.value.split('x').map(Number); setWidth(w); setHeight(h); }}
                    className={styles.select}
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
              <div className={styles.checkboxRow}>
                <input type="checkbox" id="chk-audio" checked={useAudio}
                  onChange={e => setUseAudio(e.target.checked)} className={styles.checkbox} />
                <label htmlFor="chk-audio" className={styles.checkboxLabel}>🎵 Audio (narare)</label>
              </div>
              {useAudio && (
                <>
                  <textarea value={audioPrompt} onChange={e => setAudioPrompt(e.target.value)}
                    placeholder="Scrie textul pe care sa-l spuna naratorul sau lasă gol și va fi generat automat un text potrivit"
                    rows={3} className={styles.textarea}
                    style={{ marginTop: 12, marginBottom: 12, minHeight: 60 }} />
                  <label className={styles.label}>Voce narator</label>
                  <select value={voiceName} onChange={e => setVoiceName(e.target.value)} className={styles.select}>
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
              <div className={styles.formGroup}>
                <div className={styles.checkboxRow}>
                  <input type="checkbox" id="chk-website" checked={useWebsite}
                    onChange={e => setUseWebsite(e.target.checked)} className={styles.checkbox} />
                  <label htmlFor="chk-website" className={styles.checkboxLabel}>🌐 Extrage identitate vizuală de pe site</label>
                </div>
                {useWebsite && (
                  <div style={{ marginTop: 10 }}>
                    <label className={styles.label}>URL site</label>
                    <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" className={styles.input} />
                  </div>
                )}
              </div>
              <div className={styles.checkboxRow} style={{ marginTop: 14 }}>
                <input type="checkbox" id="chk-subs" checked={useSubtitles}
                  onChange={e => setUseSubtitles(e.target.checked)} className={styles.checkbox} />
                <label htmlFor="chk-subs" className={styles.checkboxLabel}>💬 Subtitrări</label>
              </div>
            </SectionBody>

            {/* Generate button in form (visible when idle or generating) */}
            {!showBottomBar && (
              <div className={styles.formActions}>
                <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
                  className={styles.btnPrimary}
                >
                  {isGenerating ? '⏳ Se generează...' : '🚀 Generare video'}
                </button>
              </div>
            )}
          </div>

          {/* ===== RIGHT PANEL: OUTPUT ===== */}
          <div className={styles.outputPanel}>
            {/* History — collapsible panel */}
            {history.length > 0 && (
              <div className={styles.historyPanel}>
                <div
                  className={styles.historyToggle}
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={historyExpanded}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHistoryExpanded(!historyExpanded); } }}
                >
                  <span className={styles.historyToggleIcon}>🕐</span>
                  <span className={styles.historyToggleTitle}>Istoric</span>
                  <span className={styles.historyToggleCount}>{history.length}</span>
                  <span className={`${styles.historyToggleChevron} ${historyExpanded ? styles.historyToggleChevronOpen : ''}`}>
                    ▼
                  </span>
                </div>
                {historyExpanded && (
                  <div className={styles.historyList}>
                    {history.map(v => (
                      <div key={v.id}
                        onClick={() => loadHistoryVideo(v)}
                        className={canInteract(v.status) ? styles.historyItemClickable : styles.historyItem}
                      >
                        <span className={styles.historyStatus}>
                          {historyStatusIcon(v.status)}
                        </span>
                        <span className={styles.historyPrompt}>
                          {v.prompt.length > 48 ? v.prompt.slice(0, 48) + '…' : v.prompt}
                        </span>
                        <button onClick={(e) => handleDeleteHistory(e, v.id)}
                          className={styles.historyDelete}
                          title="Șterge"
                          aria-label="Șterge din istoric"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Generating state (composition phase) */}
            {mode === 'generating' && (
              <div className={styles.statusPanel}>
                <div className={styles.spinner} />
                <div className={styles.statusTitle}>
                  {status?.progress?.step === 'fetching_website' ? '🌐 Se extrage identitatea vizuală...'
                    : status?.progress?.step === 'generating_composition' ? '🤖 Se generează conținutul...'
                    : status?.progress?.step === 'generating_audio' ? '🎵 Se generează nararea audio...'
                    : status?.progress?.message || '⏳ Se pregătește...'}
                </div>
                <div className={styles.progressSteps}>
                  {timelineSteps.slice(0, 4).map((s, i) => {
                    const currentStep = status?.progress?.step ? (stepGroups[status.progress.step] ?? -1) : -1;
                    const done = currentStep > i;
                    const active = currentStep === i;
                    return (
                      <div key={s.step} className={styles.progressStep}>
                        <div className={`${styles.progressDot} ${done ? styles.progressDotDone : active ? styles.progressDotActive : ''}`} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Composition ready — HTML preview */}
            {mode === 'preview_composition' && videoId && (
              <div>
                <div className={styles.previewPanel}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewTitle}>👁️ Previzualizare compoziție</span>
                    <span className={styles.previewResolution}>{width}×{height}</span>
                    <div className={styles.previewSpacer} />
                    <button
                      onClick={() => setPreviewExpanded(!previewExpanded)}
                      className={styles.btnIcon}
                      aria-label={previewExpanded ? 'Restrânge previzualizarea' : 'Extinde previzualizarea'}
                    >
                      {previewExpanded ? '🔽 Restrânge' : '🔼 Extinde'}
                    </button>
                    <button
                      onClick={() => window.open(`${API}/api/video/${videoId}/composition`, '_blank')}
                      className={styles.btnIcon}
                      title="Deschide într-un tab nou"
                      aria-label="Deschide previzualizarea într-un tab nou"
                    >
                      ↗️
                    </button>
                  </div>

                  {historyStatus && (historyStatus.tts_text || historyStatus.tts_voice) && (
                    <div className={styles.narrationInfo}>
                      {historyStatus.tts_text && (
                        <div className={styles.narrationLine}>
                          <span className={styles.narrationLabel}>🎙️ Narare:</span> {historyStatus.tts_text}
                        </div>
                      )}
                      {historyStatus.tts_voice && (
                        <div className={styles.narrationLine}>
                          <span className={styles.narrationLabel}>🔊 Voce:</span> {historyStatus.tts_voice}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={previewExpanded ? styles.previewBodyNoPadding : styles.previewBody}>
                    <hyperframes-player
                      ref={playerRef}
                      src={`${API}/api/video/${videoId}/composition`}
                      controls
                      className={styles.player}
                      style={{ aspectRatio: previewExpanded ? undefined : `${width}/${height}` }}
                      title="Composition preview"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Rendering MP4 state */}
            {mode === 'rendering' && (
              <div className={styles.statusPanel}>
                <div className={`${styles.spinner} ${styles.spinnerSuccess}`} />
                <div className={styles.statusTitle}>🎬 Se generează videoclipul MP4...</div>
                <div className={styles.progressBar}>
                  <div className={styles.progressBarFill} />
                </div>
                <style>{`@keyframes shimmer { 0% { width: 20%; } 50% { width: 70%; } 100% { width: 20%; } }`}</style>
              </div>
            )}

            {/* Preview — MP4 ready */}
            {(mode === 'preview') && videoId && (
              <div>
                <div className={styles.previewPanel}>
                  {historyStatus && (
                    <div className={styles.narrationInfo} style={{ borderBottom: 'none' }}>
                      {historyStatus.tts_text && (
                        <div className={styles.narrationLine}>
                          <span className={styles.narrationLabel}>Narare:</span> {historyStatus.tts_text}
                        </div>
                      )}
                      {historyStatus.tts_voice && (
                        <div className={styles.narrationLine}>
                          <span className={styles.narrationLabel}>Voce:</span> {historyStatus.tts_voice}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={styles.previewBodyNoPadding}>
                    <video
                      ref={previewRef}
                      className={styles.video}
                      style={{ aspectRatio: `${width}/${height}` }}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                      onPlay={() => setVideoPlaying(true)}
                      onPause={() => setVideoPlaying(false)}
                    >
                      <source src={`${API}/api/video/${videoId}/download`} type="video/mp4" />
                    </video>

                    {/* Custom video controls */}
                    <div className={styles.videoControls}>
                      <button
                        onClick={handleVideoPlayPause}
                        className={styles.videoCtrlBtn}
                        aria-label={videoPlaying ? 'Pauză' : 'Redare'}
                        title={videoPlaying ? 'Pauză' : 'Redare'}
                      >
                        {videoPlaying ? '⏸️' : '▶️'}
                      </button>
                      <button
                        onClick={handleVideoRestart}
                        className={styles.videoCtrlBtn}
                        aria-label="Reîncepe"
                        title="Reîncepe"
                      >
                        🔄
                      </button>
                      <span className={styles.videoTime}>
                        {fmtTime(videoCurrentTime)} / {fmtTime(videoDuration || duration)}
                      </span>
                    </div>
                  </div>
                </div>

                {error && <div className={styles.errorBox}>❌ {error}</div>}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ===== FIXED BOTTOM ACTION BAR ===== */}
      {showBottomBar && (
        <div className={styles.bottomBar}>
          <div className={styles.bottomBarInner}>
            <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}
              className={styles.btnPrimary}
              style={{ flex: 1 }}
            >
              {isGenerating ? '⏳ Se generează...' : '🚀 Generare nouă'}
            </button>
            {mode === 'preview' && (
              <button onClick={handleDownload} className={styles.btnSuccess} style={{ flex: 1 }}>
                ⬇️ Download MP4
              </button>
            )}
            {mode === 'preview' && (
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/api/video/${videoId}/download`);
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2000);
              }}
                className={styles.btnSecondary}
                style={{ flex: '0 0 auto' }}
              >{copiedUrl ? '✅ Copiat!' : '📋 Copy URL'}</button>
            )}
            {mode === 'preview_composition' && (
              <>
                <button onClick={handleRenderMP4} className={styles.btnSuccess} style={{ flex: 1 }}>
                  ⬇️ Download MP4
                </button>
                <button onClick={handleRegenerate} className={styles.btnSecondary} style={{ flex: 1 }}>
                  🔄 Regenerare
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Spacer for bottom bar */}
      {showBottomBar && <div className={styles.bottomBarSpacer} />}
    </div>
  );
}
