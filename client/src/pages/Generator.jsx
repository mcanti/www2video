import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n/useTranslation.jsx';
import styles from './Generator.module.css';

// ── Lucide Icons ──
import {
  Sparkles, Settings, Play, Pause, RotateCcw, Download, Copy, Check,
  X, ChevronDown, Clock, Bug, Maximize2, ExternalLink, Trash2,
  Volume2, Subtitles, Globe, Languages, Loader, AlertCircle,
  CheckCircle, Eye, Plus, FileText, Monitor,
} from 'lucide-react';

const API = '';
const LS_KEY = 'www2video_history';

/* ========== HOOKS ========== */

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

/* ========== HISTORY UTILS ========== */

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}

function saveToHistory(v) {
  const list = loadHistory().filter(item => item.id !== v.id);
  list.unshift({
    id: v.id, prompt: v.prompt, status: v.status, duration: v.duration || 10,
    width: v.width || 1280, height: v.height || 720, audioPrompt: v.audioPrompt || '',
    useAudio: v.useAudio || false, useSubtitles: v.useSubtitles || false,
    voiceName: v.voiceName || 'Kore', useWebsite: v.useWebsite || false,
    sourceUrl: v.sourceUrl || '', created_at: v.created_at || new Date().toISOString(),
  });
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
}

/* ========== CONSTANTS ========== */

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

const RESOLUTIONS = [
  { value: '1280x720', label: '1280×720 (HD)' },
  { value: '1920x1080', label: '1920×1080 (Full HD)' },
  { value: '2560x1440', label: '2560×1440 (2K)' },
  { value: '720x1280', label: '720×1280 (Reels)' },
  { value: '1080x1920', label: '1080×1920 (Full Reels)' },
  { value: '1080x1080', label: '1080×1080 (Square)' },
];

/* ========== HELPERS ========== */

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const canInteract = (s) => s === 'ready' || s === 'failed' || s === 'composition_ready';

const stepGroups = {
  'queued': -1, 'initializing': 0, 'initialized': 0,
  'generating_composition': 1, 'composition_ai': 1, 'composition_done': 1,
  'generating_audio': 1, 'audio_done': 1, 'audio_skip': 1,
  'writing_composition': 2, 'validating': 3, 'lint_warning': 3, 'validated': 3,
  'composition_ready': 3, 'rendering_video': 4, 'finalizing': 5,
  'fetching_website': 0, 'extracting_identity': 1, 'saving_identity': 2,
  'ready': 6, 'failed': 6,
};

/* ========== STATUS ICON ========== */

const StatusIcon = ({ status }) => {
  if (status === 'ready') return <CheckCircle size={16} className={styles.iconGreen} />;
  if (status === 'composition_ready') return <Eye size={16} className={styles.iconPurple} />;
  if (status === 'failed') return <AlertCircle size={16} className={styles.iconRed} />;
  return <Loader size={16} className={styles.iconSpin} />;
};

/* ========== MAIN COMPONENT ========== */

export default function Generator() {
  const { t, lang, toggleLang } = useTranslation();

  /* ---- State ---- */
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
  const [mode, setMode] = useState('idle');
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

  /* ---- Video custom controls ---- */
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  /* ── SINGLE collapsible settings section ── */
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isDebug = window.location.search.includes('debug=true');

  /* ---- Polling callback ---- */
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
    if (data.status === 'composition_ready') setMode('preview_composition');
    else if (data.status === 'ready') setMode('preview');
    else if (data.status === 'failed') { setError(data.error || t('error.generation_failed')); setMode('error'); }
  };

  const status = usePollStatus(
    (mode === 'generating' || mode === 'rendering' || mode === 'preview_composition') ? videoId : null,
    handlePollReady
  );

  /* ---- Fetch debug HTML ---- */
  useEffect(() => {
    if (!videoId || (mode !== 'preview' && mode !== 'preview_composition')) return;
    if (!debugOpen && !isDebug) return;
    (async () => {
      try {
        const res = await fetch(`${API}/api/video/${videoId}/preview`);
        if (res.ok) setDebugHtml(await res.text());
      } catch {}
    })();
  }, [videoId, mode, debugOpen, isDebug]);

  /* ---- Load history video ---- */
  const loadHistoryVideo = async (v) => {
    setVideoId(v.id);
    if (v.status === 'generating') setMode('generating');
    else setMode(v.status === 'composition_ready' ? 'preview_composition' : 'preview');
    setPrompt(v.prompt || '');
    setDuration(v.duration || 10); setWidth(v.width || 1280); setHeight(v.height || 720);
    setUseAudio(v.useAudio || false); setUseSubtitles(v.useSubtitles || false);
    setAudioPrompt(v.audioPrompt || ''); setVoiceName(v.voiceName || 'Kore');
    setUseWebsite(v.useWebsite || false); setUrl(v.sourceUrl || '');
    setHistoryStatus(null); setError(''); setHistoryExpanded(false);
    try {
      const res = await fetch(`${API}/api/video/${v.id}/status`);
      const data = await res.json();
      setHistoryStatus(data);
      if (data.tts_text) { setUseAudio(true); setAudioPrompt(data.tts_text); }
      if (data.tts_voice) setVoiceName(data.tts_voice);
    } catch {}
  };

  const handleDeleteHistory = async (e, id) => {
    e.stopPropagation(); e.preventDefault();
    try { await fetch(`${API}/api/video/${id}`, { method: 'DELETE' }); } catch {}
    const list = loadHistory().filter(item => item.id !== id);
    localStorage.setItem(LS_KEY, JSON.stringify(list));
    setHistory(loadHistory());
  };

  /* ---- Generate ---- */
  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;
    setVideoId(null); setMode('generating'); setError(''); setDebugHtml('');
    const options = { quality: 'draft', duration, width, height, useAudio, useSubtitles, voiceName };
    if (audioPrompt.trim()) options.audioPrompt = audioPrompt.trim();
    if (useWebsite && url.trim()) options.sourceUrl = url.trim();
    try {
      const res = await fetch(`${API}/api/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, options }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setMode('error'); return; }
      setVideoId(data.videoId);
      saveToHistory({ id: data.videoId, prompt: text, status: 'generating', duration, width, height, useAudio, useSubtitles, audioPrompt: audioPrompt.trim(), voiceName, useWebsite, sourceUrl: url.trim(), created_at: new Date().toISOString() });
      setHistory(loadHistory());
    } catch (err) { setError(err.message); setMode('error'); }
  };

  const handleRenderMP4 = async () => {
    if (!videoId) return;
    setMode('rendering'); setError('');
    try {
      const res = await fetch(`${API}/api/video/${videoId}/render`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { setError(data.error); setMode('preview_composition'); return; }
    } catch (err) { setError(err.message); setMode('preview_composition'); }
  };

  const handleDownload = () => {
    if (!videoId) return;
    const a = document.createElement('a');
    a.href = `${API}/api/video/${videoId}/download`;
    a.download = `www2video-${videoId.slice(0, 8)}.mp4`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleRegenerate = () => { setVideoId(null); handleGenerate(); };

  /* ---- Video controls ---- */
  const handleVideoPlayPause = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setVideoPlaying(true); }
    else { video.pause(); setVideoPlaying(false); }
  }, []);

  const handleVideoRestart = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;
    video.currentTime = 0; setVideoCurrentTime(0);
    video.play(); setVideoPlaying(true);
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

  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    setVideoPlaying(!video.paused);
    setVideoCurrentTime(video.currentTime || 0);
    setVideoDuration(video.duration || 0);
  }, [mode, videoId]);

  /* ---- HyperFrames player events ---- */
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onReady = (e) => { setPlayerReady(true); setPlayerDuration(e.detail?.duration || 0); };
    const onError = () => { setError(t('preview.error_player')); };
    player.addEventListener('ready', onReady);
    player.addEventListener('error', onError);
    setPlayerReady(false); setPlayerDuration(0);
    return () => { player.removeEventListener('ready', onReady); player.removeEventListener('error', onError); };
  }, [mode, videoId]);

  /* ---- Derived state ---- */
  const isGenerating = mode === 'generating' || mode === 'rendering';
  const showBottomBar = mode === 'preview' || mode === 'preview_composition';

  /* ---- Timeline steps ---- */
  const timelineSteps = [
    { step: 'initializing', key: 'progress.preparing' },
    { step: 'generating_composition', key: 'progress.content' },
    { step: 'writing_composition', key: 'progress.saving' },
    { step: 'validating', key: 'progress.validating' },
    { step: 'rendering_video', key: 'progress.video' },
    { step: 'finalizing', key: 'progress.finalizing' },
  ];

  return (
    <div className={styles.app}>
      {/* ══════ HEADER ══════ */}
      <header className={styles.header}>
        <img src="/assets/logo-inv.png" className={styles.logo} alt="Cognitum" />
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>{t('header.title')}</h1>
          <span className={styles.subtitle}>{t('header.subtitle')}</span>
        </div>
        <div className={styles.headerActions}>
          <button onClick={toggleLang} className={styles.iconBtn} title={lang === 'ro' ? 'English' : 'Română'}>
            <Languages size={18} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>{t('header.lang_toggle')}</span>
          </button>
          <button
            onClick={() => setDebugOpen(!debugOpen)}
            className={`${styles.iconBtn} ${debugOpen ? styles.iconBtnActive : ''}`}
            title={debugOpen ? t('header.debug_hide') : t('header.debug_show')}
          >
            <Bug size={18} />
          </button>
          {isDebug && <span className={styles.debugBadge}>DEBUG</span>}
        </div>
      </header>

      <main className={styles.main}>
        {/* ══════ DEBUG QUICK-LOAD ══════ */}
        {isDebug && (
          <div className={styles.debugQuickPanel}>
            <span>{t('debug.title')}</span>
            <button onClick={() => {
              setPrompt(t('lumi.prompt')); setDuration(10);
              setUseAudio(true); setAudioPrompt(t('lumi.narration'));
              setUseWebsite(true); setUrl('https://lumi.bot');
            }} className={styles.btnOutlineSm}>
              {t('debug.load_defaults')}
            </button>
          </div>
        )}

        {/* ══════ DEBUG INFO PANEL ══════ */}
        {debugOpen && (
          <div className={styles.debugPanel}>
            <div className={styles.debugPanelHeader}>
              <span className={styles.debugPanelTitle}>{t('debug.panel_title')}</span>
              <button onClick={() => setDebugOpen(false)} className={styles.btnGhostSm} aria-label={t('debug.close')}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.debugPanelBody}>
              {videoId ? (
                <>
                  <div className={styles.debugRow}><span>{t('debug.video_id')}</span><code>{videoId}</code></div>
                  <div className={styles.debugRow}><span>{t('debug.mode')}</span><code>{mode}</code></div>
                  {status && (
                    <div className={styles.debugSection}>
                      <div className={styles.debugSectionTitle}>{t('debug.status')}</div>
                      <pre className={styles.debugPre}>{JSON.stringify(status, null, 2)}</pre>
                    </div>
                  )}
                  {debugHtml && (
                    <div className={styles.debugSection}>
                      <div className={styles.debugSectionTitle}>{t('debug.composition_html')}</div>
                      <button onClick={() => setShowDetails(prev => !prev)} className={styles.btnGhostSm}>
                        {showDetails ? t('debug.hide_html') : t('debug.show_html')} ({Math.round(debugHtml.length / 1024)} KB)
                      </button>
                      {showDetails && <pre className={styles.debugCode}>{debugHtml}</pre>}
                    </div>
                  )}
                </>
              ) : (
                <p className={styles.debugEmpty}>{t('debug.empty')}</p>
              )}
            </div>
          </div>
        )}

        {/* ══════ TWO-COLUMN LAYOUT ══════ */}
        <div className={styles.layout}>
          {/* ═══ LEFT: FORM ═══ */}
          <div className={styles.formPanel}>
            {/* ── Prompt (always visible) ── */}
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('form.prompt_placeholder')}
              rows={5}
              className={styles.promptTextarea}
            />

            {/* ── SINGLE collapsible SETTINGS section ── */}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`${styles.settingsToggle} ${settingsOpen ? styles.settingsToggleOpen : ''}`}
              aria-expanded={settingsOpen}
            >
              <Settings size={16} />
              <span>{t('sections.settings')}</span>
              <ChevronDown size={16} className={`${styles.chevron} ${settingsOpen ? styles.chevronOpen : ''}`} />
            </button>

            {settingsOpen && (
              <div className={styles.settingsBody}>
                {/* Duration + Resolution */}
                <div className={styles.fieldRow}>
                  <div className={styles.fieldSm}>
                    <label className={styles.fieldLabel}>{t('form.duration_label')}</label>
                    <input type="text" inputMode="numeric" value={duration}
                      onChange={e => { const v = e.target.value; if (v === '' || /^\d+$/.test(v)) { const n = parseInt(v, 10); if (n >= 1 && n <= 120) setDuration(n); else if (v === '') setDuration(''); } }}
                      onBlur={e => { const n = parseInt(e.target.value, 10); if (isNaN(n) || n < 1) setDuration(10); else if (n > 120) setDuration(120); else setDuration(n); }}
                      className={styles.inputSm}
                    />
                  </div>
                  <div className={styles.fieldGrow}>
                    <label className={styles.fieldLabel}>{t('form.resolution_label')}</label>
                    <select value={`${width}x${height}`}
                      onChange={e => { const [w, h] = e.target.value.split('x').map(Number); setWidth(w); setHeight(h); }}
                      className={styles.select}
                    >
                      {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className={styles.divider} />

                {/* Audio */}
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={useAudio} onChange={e => setUseAudio(e.target.checked)} className={styles.checkbox} />
                  <Volume2 size={16} className={styles.checkIcon} />
                  <span>{t('form.audio_narration')}</span>
                </label>
                {useAudio && (
                  <div className={styles.conditionalFields}>
                    <textarea value={audioPrompt} onChange={e => setAudioPrompt(e.target.value)}
                      placeholder={t('form.audio_placeholder')} rows={2}
                      className={styles.textareaSm}
                    />
                    <label className={styles.fieldLabel}>{t('form.voice_label')}</label>
                    <select value={voiceName} onChange={e => setVoiceName(e.target.value)} className={styles.select}>
                      {GEMINI_VOICES.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                    </select>
                  </div>
                )}

                <div className={styles.divider} />

                {/* Website */}
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={useWebsite} onChange={e => setUseWebsite(e.target.checked)} className={styles.checkbox} />
                  <Globe size={16} className={styles.checkIcon} />
                  <span>{t('form.website_extract')}</span>
                </label>
                {useWebsite && (
                  <div className={styles.conditionalFields}>
                    <label className={styles.fieldLabel}>{t('form.website_url_label')}</label>
                    <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                      placeholder={t('form.website_url_placeholder')}
                      className={styles.input}
                    />
                  </div>
                )}

                {/* Subtitles */}
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={useSubtitles} onChange={e => setUseSubtitles(e.target.checked)} className={styles.checkbox} />
                  <Subtitles size={16} className={styles.checkIcon} />
                  <span>{t('form.subtitles')}</span>
                </label>
              </div>
            )}

            {/* Generate Button (when idle/generating — no bottom bar) */}
            {!showBottomBar && (
              <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className={styles.btnGenerate}>
                {isGenerating ? <><Loader size={18} className={styles.btnSpin} /> {t('form.generating')}</> : <><Sparkles size={18} /> {t('form.generate')}</>}
              </button>
            )}
          </div>

          {/* ═══ RIGHT: OUTPUT ═══ */}
          <div className={styles.outputPanel}>
            {/* ── History ── */}
            {history.length > 0 && (
              <div className={styles.historyPanel}>
                <button className={styles.historyToggle} onClick={() => setHistoryExpanded(!historyExpanded)} aria-expanded={historyExpanded}>
                  <Clock size={16} />
                  <span className={styles.historyToggleTitle}>{t('history.title')}</span>
                  <span className={styles.historyBadge}>{history.length}</span>
                  <ChevronDown size={14} className={`${styles.chevron} ${historyExpanded ? styles.chevronOpen : ''}`} />
                </button>
                {historyExpanded && (
                  <div className={styles.historyList}>
                    {history.map(v => (
                      <div key={v.id} onClick={() => loadHistoryVideo(v)}
                        className={canInteract(v.status) ? styles.historyItem : styles.historyItemDisabled}
                      >
                        <StatusIcon status={v.status} />
                        <span className={styles.historyItemText}>
                          {v.prompt.length > 48 ? v.prompt.slice(0, 48) + '…' : v.prompt}
                        </span>
                        <button onClick={(e) => handleDeleteHistory(e, v.id)}
                          className={styles.historyDelete} title={t('history.delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Generating ── */}
            {mode === 'generating' && (
              <div className={styles.statusCard}>
                <Loader size={32} className={styles.spinnerIcon} />
                <p className={styles.statusText}>
                  {status?.progress?.step === 'fetching_website' ? t('progress.extracting')
                    : status?.progress?.step === 'generating_composition' ? t('progress.generating_content')
                    : status?.progress?.step === 'generating_audio' ? t('progress.generating_audio')
                    : status?.progress?.message || t('progress.waiting')}
                </p>
                <div className={styles.progressDots}>
                  {timelineSteps.slice(0, 4).map((s, i) => {
                    const currentStep = status?.progress?.step ? (stepGroups[status.progress.step] ?? -1) : -1;
                    return <div key={s.step}
                      className={`${styles.dot} ${currentStep > i ? styles.dotDone : currentStep === i ? styles.dotActive : ''}`}
                    />;
                  })}
                </div>
              </div>
            )}

            {/* ── Composition Preview ── */}
            {mode === 'preview_composition' && videoId && (
              <div className={styles.previewCard}>
                <div className={styles.previewHeader}>
                  <Eye size={16} />
                  <span className={styles.previewTitle}>{t('preview.composition_title')}</span>
                  <span className={styles.previewRes}>{width}×{height}</span>
                  <div className={styles.spacer} />
                  <button onClick={() => setPreviewExpanded(!previewExpanded)} className={styles.btnIconSm}>
                    <Maximize2 size={14} />
                  </button>
                  <button onClick={() => window.open(`${API}/api/video/${videoId}/composition`, '_blank')} className={styles.btnIconSm} title={t('preview.open_new_tab')}>
                    <ExternalLink size={14} />
                  </button>
                </div>
                {historyStatus && (historyStatus.tts_text || historyStatus.tts_voice) && (
                  <div className={styles.metaBar}>
                    {historyStatus.tts_text && <span><b>{t('preview.narration')}:</b> {historyStatus.tts_text}</span>}
                    {historyStatus.tts_voice && <span><b>{t('preview.voice')}:</b> {historyStatus.tts_voice}</span>}
                  </div>
                )}
                <div className={previewExpanded ? styles.playerExpanded : styles.playerBox}>
                  <hyperframes-player
                    ref={playerRef}
                    src={`${API}/api/video/${videoId}/composition`}
                    controls
                    className={styles.player}
                    style={{ aspectRatio: previewExpanded ? undefined : `${width}/${height}` }}
                  />
                </div>
              </div>
            )}

            {/* ── Rendering ── */}
            {mode === 'rendering' && (
              <div className={styles.statusCard}>
                <Loader size={32} className={styles.spinnerIcon} style={{ color: 'var(--color-green-500)' }} />
                <p className={styles.statusText}>{t('preview.rendering')}</p>
                <div className={styles.progressBar}><div className={styles.progressFill} /></div>
              </div>
            )}

            {/* ── MP4 Preview ── */}
            {mode === 'preview' && videoId && (
              <div className={styles.previewCard}>
                {historyStatus && (historyStatus.tts_text || historyStatus.tts_voice) && (
                  <div className={styles.metaBar}>
                    {historyStatus.tts_text && <span><b>{t('preview.narration')}:</b> {historyStatus.tts_text}</span>}
                    {historyStatus.tts_voice && <span><b>{t('preview.voice')}:</b> {historyStatus.tts_voice}</span>}
                  </div>
                )}
                <video ref={previewRef} className={styles.video}
                  style={{ aspectRatio: `${width}/${height}` }}
                  onTimeUpdate={handleVideoTimeUpdate}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                >
                  <source src={`${API}/api/video/${videoId}/download`} type="video/mp4" />
                </video>
                <div className={styles.videoControls}>
                  <button onClick={handleVideoPlayPause} className={styles.videoCtrlBtn} aria-label={videoPlaying ? t('actions.pause') : t('actions.play')}>
                    {videoPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button onClick={handleVideoRestart} className={styles.videoCtrlBtn} aria-label={t('actions.restart')}>
                    <RotateCcw size={18} />
                  </button>
                  <span className={styles.videoTime}>{fmtTime(videoCurrentTime)} / {fmtTime(videoDuration || duration)}</span>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {error && (
              <div className={styles.errorBox}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ══════ FIXED BOTTOM BAR ══════ */}
      {showBottomBar && (
        <>
          <div className={styles.bottomBar}>
            <div className={styles.bottomBarInner}>
              <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()} className={styles.btnGenerate} style={{ flex: 1 }}>
                {isGenerating ? <><Loader size={18} className={styles.btnSpin} /> {t('form.generating')}</> : <><Sparkles size={18} /> {t('actions.generate_new')}</>}
              </button>
              {mode === 'preview' && (
                <button onClick={handleDownload} className={styles.btnSuccess} style={{ flex: 1 }}>
                  <Download size={18} /> {t('actions.download_mp4')}
                </button>
              )}
              {mode === 'preview' && (
                <button onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/video/${videoId}/download`);
                  setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000);
                }} className={styles.btnOutline} style={{ flex: 1 }}>
                  {copiedUrl ? <><Check size={18} /> {t('actions.copied')}</> : <><Copy size={18} /> {t('actions.copy_url')}</>}
                </button>
              )}
              {mode === 'preview_composition' && (
                <>
                  <button onClick={handleRenderMP4} className={styles.btnSuccess} style={{ flex: 1 }}>
                    <Download size={18} /> {t('actions.download_mp4')}
                  </button>
                  <button onClick={handleRegenerate} className={styles.btnOutline} style={{ flex: 1 }}>
                    <RotateCcw size={18} /> {t('actions.regenerate')}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className={styles.bottomBarSpacer} />
        </>
      )}
    </div>
  );
}
