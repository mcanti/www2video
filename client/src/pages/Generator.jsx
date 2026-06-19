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
    audioPrompt: v.audioPrompt || '',
    useAudio: v.useAudio || false,
    useWebsite: v.useWebsite || false,
    sourceUrl: v.sourceUrl || '',
    created_at: v.created_at || new Date().toISOString(),
  });
  localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 20)));
}

// Debug mode defaults for lumi.bot product launch
const LUMI_DEFAULTS = {
  prompt: `Product launch video for LumiBot - an AI assistant bot that helps teams automate workflows and boost productivity. 

Scene 1 (0-3s): Futuristic title card with glowing "LumiBot" text, subtitle "AI-Powered Workflow Assistant". Dark background with subtle particle effect or radial glow in purple/teal. Text slides in from left with a slight blur-to-sharp effect.

Scene 2 (3-7s): Show three feature cards side by side. Card 1: "Smart Automation" with robot icon. Card 2: "Team Collaboration" with people icon. Card 3: "24/7 Availability" with clock icon. Each card slides up sequentially with a slight bounce.

Scene 3 (7-10s): Strong CTA panel. "Ready to Transform Your Workflow?" in large bold text. Below it: "Get Started at lumi.bot" with a glowing button outline effect. Final frame holds for 2s with a subtle breathe animation.`,
  duration: 10,
  useAudio: true,
  audioPrompt: "Introducing LumiBot - your intelligent AI workflow assistant. Automate repetitive tasks, collaborate seamlessly with your team, and keep your projects running 24/7. Ready to transform how you work? Visit Lumi.bot and get started today.",
  useWebsite: false,
  sourceUrl: 'https://lumi.bot',
};

export default function Generator() {
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(10);
  const [useWebsite, setUseWebsite] = useState(false);
  const [useAudio, setUseAudio] = useState(false);
  const [audioPrompt, setAudioPrompt] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [mode, setMode] = useState('idle'); // idle | generating | preview | error
  const [history, setHistory] = useState(loadHistory);
  const [error, setError] = useState('');
  const [historyStatus, setHistoryStatus] = useState(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugHtml, setDebugHtml] = useState('');
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
    if (!isDebug || !videoId || mode !== 'preview') return;
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
    setUseAudio(v.useAudio || false);
    setAudioPrompt(v.audioPrompt || '');
    setUseWebsite(v.useWebsite || false);
    setUrl(v.sourceUrl || '');
    setHistoryStatus(null);
    try {
      const res = await fetch(`${API}/api/video/${v.id}/status`);
      const data = await res.json();
      setHistoryStatus(data);
    } catch {}
  };

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text) return;

    setMode('generating');
    setError('');
    setDebugHtml('');

    const body = { prompt: text, options: { quality: 'draft', duration, useAudio } };
    if (audioPrompt.trim()) body.options.audioPrompt = audioPrompt.trim();
    if (useWebsite && url.trim()) body.sourceUrl = url.trim();

    try {
      const endpoint = useWebsite ? '/api/video/from-website' : '/api/video/generate';
      const reqBody = useWebsite
        ? { url: url.trim(), prompt: text, options: { quality: 'draft', duration, useAudio, audioPrompt: audioPrompt.trim() } }
        : body;

      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setMode('idle'); return; }
      setVideoId(data.videoId);
      saveToHistory({
        id: data.videoId, prompt: text, status: 'generating',
        duration, useAudio, audioPrompt: audioPrompt.trim(),
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
      <header className="app-header">
        <h1>www2video</h1>
        <span className="subtitle">AI video generator</span>
        {isDebug && (
          <span style={{
            marginLeft: 12, fontSize: 11, padding: '2px 8px',
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
          <div style={{ flex: '1 1 400px', minWidth: 300 }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 24,
            }}>
              {/* Video prompt */}
              <label style={{ display: 'block', marginBottom: 12, fontWeight: 600 }}>
                Descrie videoclipul
              </label>
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

              {/* Duration */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                  ⏱ Durată (secunde)
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
                    width: 80, background: '#111', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* From website checkbox */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="chk-website"
                  checked={useWebsite}
                  onChange={e => setUseWebsite(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <label htmlFor="chk-website" style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
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
                    width: '100%', marginTop: 8, background: '#111',
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text)', padding: 12, fontSize: 14,
                    fontFamily: 'inherit',
                  }}
                />
              )}

              {/* Audio toggle */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="chk-audio"
                  checked={useAudio}
                  onChange={e => setUseAudio(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <label htmlFor="chk-audio" style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  🎵 Audio (narare)
                </label>
              </div>
              {useAudio && (
                <textarea
                  value={audioPrompt}
                  onChange={e => setAudioPrompt(e.target.value)}
                  placeholder="Scrie textul pe care să-l spună naratorul..."
                  rows={3}
                  style={{
                    width: '100%', marginTop: 8, background: '#111',
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text)', padding: 12, fontSize: 14,
                    resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                style={{
                  width: '100%', padding: '14px 24px', marginTop: 16,
                  background: isGenerating ? 'var(--accent)' : 'linear-gradient(135deg, var(--accent), #a78bfa)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  opacity: isGenerating || !prompt.trim() ? 0.5 : 1,
                  transition: 'opacity 0.2s',
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

          {/* Right panel — preview */}
          <div style={{ flex: '2 1 500px', minWidth: 300 }}>
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
                }}>
                  <button
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = `${API}/api/video/${videoId}/download`;
                      a.download = `www2video-${videoId?.slice(0, 8)}.mp4`;
                      a.click();
                    }}
                    style={{
                      flex: 1, padding: '10px', background: '#1a3a1a',
                      border: '1px solid var(--success)', borderRadius: 6,
                      color: 'var(--success)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    }}
                  >
                    ⬇ Descarcă MP4
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={!prompt.trim()}
                    style={{
                      flex: 1, padding: '10px', background: '#2a1a1a',
                      border: '1px solid var(--accent)', borderRadius: 6,
                      color: 'var(--accent)', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    }}
                  >
                    🔄 Regenerare
                  </button>
                </div>
              )}

              {/* Debug panel (visible only in debug mode when video is ready) */}
              {isDebug && mode === 'preview' && ((status || historyStatus)?.status === 'ready') && (
                <div style={{
                  borderTop: '1px solid var(--border)',
                }}>
                  <button
                    onClick={() => setDebugOpen(!debugOpen)}
                    style={{
                      width: '100%', padding: '10px 16px', background: 'transparent',
                      border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    <span style={{ transform: debugOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>▶</span>
                    {debugOpen ? 'Ascunde Debug Info' : '🔍 Arată Debug Info (HTML, prompt, etc.)'}
                  </button>
                  {debugOpen && (
                    <div style={{ padding: '0 12px 12px', fontSize: 12 }}>
                      {/* Video ID */}
                      <div style={{ marginBottom: 8 }}>
                        <strong>Video ID:</strong> <code style={{ color: 'var(--accent)' }}>{videoId}</code>
                      </div>

                      {/* Prompt */}
                      <div style={{ marginBottom: 8 }}>
                        <strong>Prompt:</strong>
                        <pre style={{
                          background: '#111', padding: 8, borderRadius: 6,
                          marginTop: 4, fontSize: 11, overflowX: 'auto',
                          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          maxHeight: 150, overflowY: 'auto',
                        }}>{(status || historyStatus)?.prompt || 'N/A'}</pre>
                      </div>

                      {/* Duration */}
                      <div style={{ marginBottom: 8 }}>
                        <strong>Durata:</strong> {duration}s
                      </div>

                      {/* Audio prompt */}
                      {useAudio && audioPrompt && (
                        <div style={{ marginBottom: 8 }}>
                          <strong>Audio Prompt:</strong>
                          <pre style={{
                            background: '#111', padding: 8, borderRadius: 6,
                            marginTop: 4, fontSize: 11, overflowX: 'auto',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 100, overflowY: 'auto',
                          }}>{audioPrompt}</pre>
                        </div>
                      )}

                      {/* Generated HTML composition */}
                      {debugHtml && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <strong>HTML Composition:</strong>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                              ({debugHtml.length} bytes)
                            </span>
                          </div>
                          <pre style={{
                            background: '#111', padding: 8, borderRadius: 6,
                            fontSize: 10, overflowX: 'auto',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 300, overflowY: 'auto',
                            lineHeight: 1.4,
                          }}>{debugHtml}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History — per-user, localStorage */}
        {history.length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>📋 Istoric</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(0, 10).map(v => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: '#111', borderRadius: 8,
                  cursor: v.status === 'ready' || v.status === 'failed' ? 'pointer' : 'default',
                  fontSize: 13,
                }}
                  onClick={() => loadHistoryVideo(v)}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: v.status === 'ready' ? 'var(--success)' : v.status === 'failed' ? 'var(--error)' : '#ffa500',
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.prompt}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    {v.duration || '?'}s
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                  {v.status === 'ready' && (
                    <span style={{ fontSize: 11, color: 'var(--success)' }}>gata</span>
                  )}
                  {v.status === 'failed' && (
                    <span style={{ fontSize: 11, color: 'var(--error)' }}>eșuat</span>
                  )}
                  {v.useAudio && <span style={{ fontSize: 11, color: 'var(--accent)' }}>🎵</span>}
                  {v.useWebsite && <span style={{ fontSize: 11 }}>🌐</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        button:hover { filter: brightness(1.15); }
        textarea:focus, input:focus { outline: none; border-color: var(--accent); }
      `}</style>
    </div>
  );
}
