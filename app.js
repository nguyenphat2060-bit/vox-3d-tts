/**
 * App: Main Orchestrator connecting UI, Web Speech API (TTSEngine),
 * Three.js (Visualizer3D), and procedural AudioModulator.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Engines
  const tts = new TTSEngine();
  const modulator = new AudioModulator();
  const visualizer = new Visualizer3D('canvas-container');
  visualizer.setAudioModulator(modulator);

  // 2. DOM Elements Cache
  const textInput = document.getElementById('tts-input');
  const spokenDisplay = document.getElementById('spoken-display');
  const wordCountElem = document.getElementById('word-count');
  const charCountElem = document.getElementById('char-count');
  const readTimeElem = document.getElementById('read-time');
  
  // Voice & Controls
  const voiceSelect = document.getElementById('voice-select');
  const voiceSearch = document.getElementById('voice-search');
  const rateSlider = document.getElementById('rate-slider');
  const pitchSlider = document.getElementById('pitch-slider');
  const volumeSlider = document.getElementById('volume-slider');
  const rateValElem = document.getElementById('rate-val');
  const pitchValElem = document.getElementById('pitch-val');
  const volumeValElem = document.getElementById('volume-val');

  // Buttons
  const btnSpeak = document.getElementById('btn-speak');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');
  const btnTogglePanel = document.getElementById('btn-toggle-panel');
  const panel = document.getElementById('speech-panel');

  // Visualizer HUD
  const hudCanvas = document.getElementById('mini-waveform');
  const statusBadge = document.getElementById('status-badge');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  // History & Presets
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const emptyHistoryNotice = document.getElementById('empty-history');

  // State
  let voicesList = [];
  let speechHistory = [];
  let karaokeWords = [];
  let activeWordIndex = -1;

  // Presets definition
  const presets = {
    cyberpunk: "Welcome to Night City, where neural implants define humanity and the neon sky bleeds synthetic rain. The future isn't coming; it's already here, running in your veins.",
    cosmos: "The cosmos is within us. We are made of star-stuff. We are a way for the universe to know itself. Somewhere, something incredible is waiting to be known.",
    turing: "We can only see a short distance ahead, but we can see plenty there that needs to be done. Can machines think? Perhaps they already dream in algorithms.",
    speedtest: "Peter Piper picked a peck of pickled peppers. A peck of pickled peppers Peter Piper picked. If Peter Piper picked a peck of pickled peppers, where's the peck of pickled peppers Peter Piper picked?",
    ai_vision: "Antigravity synthesis online. Audio frequencies aligned. Three-dimensional lattice modulated. Voice harmonics verified. Systems running at optimal capacity."
  };

  // ----------------------------------------------------------------
  // Helper: Text Statistics
  // ----------------------------------------------------------------
  function updateTextStats() {
    const text = textInput.value;
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const wpm = 140 * parseFloat(rateSlider.value);
    const estSeconds = Math.ceil((words / wpm) * 60) || 0;

    charCountElem.textContent = `${chars} chars`;
    wordCountElem.textContent = `${words} words`;
    readTimeElem.textContent = `~${estSeconds}s`;
  }

  textInput.addEventListener('input', updateTextStats);

  // ----------------------------------------------------------------
  // Voices Populator with grouping and search
  // ----------------------------------------------------------------
  function populateVoices(voices) {
    voicesList = voices;
    const filter = (voiceSearch ? voiceSearch.value : '').toLowerCase();
    voiceSelect.innerHTML = '';

    if (!voices || voices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No voices detected (Browser loading...)';
      voiceSelect.appendChild(opt);
      return;
    }

    // Filter voices
    const filtered = voices.filter(v => 
      v.name.toLowerCase().includes(filter) || 
      v.lang.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No matching voices found';
      voiceSelect.appendChild(opt);
      return;
    }

    // Group by language
    const groups = {};
    filtered.forEach((voice) => {
      const originalIndex = voices.indexOf(voice);
      const langGroup = voice.lang ? voice.lang.split('-')[0].toUpperCase() : 'OTHER';
      if (!groups[langGroup]) groups[langGroup] = [];
      groups[langGroup].push({ voice, originalIndex });
    });

    // Populate optgroups
    Object.keys(groups).sort().forEach(groupKey => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = `Language: ${groupKey}`;
      
      groups[groupKey].forEach(({ voice, originalIndex }) => {
        const option = document.createElement('option');
        option.value = originalIndex;
        const isDefault = voice.default ? ' [System Default]' : '';
        const isLocal = voice.localService ? ' (Offline)' : ' (Network)';
        option.textContent = `${voice.name} (${voice.lang})${isDefault}${isLocal}`;
        
        // Prefer English default initially
        if (voice.default || (voice.lang && voice.lang.startsWith('en') && voiceSelect.options.length === 0)) {
          option.selected = true;
        }
        optgroup.appendChild(option);
      });
      voiceSelect.appendChild(optgroup);
    });
  }

  // Hook voice loaded callback
  tts.on('voicesReady', (voices) => {
    populateVoices(voices);
  });

  if (voiceSearch) {
    voiceSearch.addEventListener('input', () => {
      populateVoices(voicesList);
    });
  }

  // ----------------------------------------------------------------
  // Parameter Sliders
  // ----------------------------------------------------------------
  function syncParams() {
    const rate = parseFloat(rateSlider.value);
    const pitch = parseFloat(pitchSlider.value);
    const volume = parseFloat(volumeSlider.value);

    rateValElem.textContent = `${rate.toFixed(1)}x`;
    pitchValElem.textContent = `${pitch.toFixed(1)}x`;
    volumeValElem.textContent = `${Math.round(volume * 100)}%`;

    modulator.setVoiceParams(rate, pitch, volume);
    updateTextStats();
  }

  rateSlider.addEventListener('input', syncParams);
  pitchSlider.addEventListener('input', syncParams);
  volumeSlider.addEventListener('input', syncParams);

  // Quick reset buttons
  document.querySelectorAll('[data-reset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-reset');
      if (target === 'rate') {
        rateSlider.value = 1.0;
      } else if (target === 'pitch') {
        pitchSlider.value = 1.0;
      } else if (target === 'volume') {
        volumeSlider.value = 1.0;
      }
      syncParams();
    });
  });

  // ----------------------------------------------------------------
  // Presets Click Handler
  // ----------------------------------------------------------------
  document.querySelectorAll('[data-preset]').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-preset');
      if (presets[key]) {
        textInput.value = presets[key];
        updateTextStats();
        // Visual feedback
        chip.classList.add('ring-2', 'ring-cyan-400');
        setTimeout(() => chip.classList.remove('ring-2', 'ring-cyan-400'), 500);
      }
    });
  });

  // ----------------------------------------------------------------
  // Karaoke / Live Word Synchronizer
  // ----------------------------------------------------------------
  function prepareKaraoke(text) {
    karaokeWords = [];
    spokenDisplay.innerHTML = '';
    
    // Split into tokens preserving words
    const tokens = text.split(/(\s+)/);
    let charOffset = 0;

    tokens.forEach((token) => {
      const isWhitespace = /^\s+$/.test(token);
      const span = document.createElement('span');
      span.textContent = token;
      
      if (!isWhitespace && token.trim().length > 0) {
        span.className = 'karaoke-word pending';
        karaokeWords.push({
          element: span,
          startIndex: charOffset,
          endIndex: charOffset + token.length,
          word: token
        });
      }
      spokenDisplay.appendChild(span);
      charOffset += token.length;
    });

    spokenDisplay.classList.remove('hidden');
    textInput.classList.add('hidden');
  }

  function resetKaraokeView() {
    spokenDisplay.classList.add('hidden');
    textInput.classList.remove('hidden');
    spokenDisplay.innerHTML = '';
    karaokeWords = [];
    activeWordIndex = -1;
  }

  function highlightWordAt(charIndex) {
    if (!karaokeWords || karaokeWords.length === 0) return;

    for (let i = 0; i < karaokeWords.length; i++) {
      const item = karaokeWords[i];
      if (charIndex >= item.startIndex && charIndex < item.endIndex + 2) {
        if (activeWordIndex !== i) {
          if (activeWordIndex >= 0 && karaokeWords[activeWordIndex]) {
            karaokeWords[activeWordIndex].element.className = 'karaoke-word spoken';
          }
          activeWordIndex = i;
          item.element.className = 'karaoke-word active';
          
          // Auto scroll view if needed
          item.element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        break;
      }
    }
  }

  // ----------------------------------------------------------------
  // TTS State & Boundary Listeners
  // ----------------------------------------------------------------
  tts.on('stateChange', ({ state }) => {
    modulator.setSpeechState(state);

    if (state === 'speaking') {
      statusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
      statusDot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-ping';
      statusText.textContent = 'Speaking';
      
      btnSpeak.classList.add('neon-glow-active');
      btnPause.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>Pause</span>
      `;
      btnPause.disabled = false;
      btnStop.disabled = false;
    } else if (state === 'paused') {
      statusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 bg-amber-500/20 text-amber-400 border border-amber-500/30';
      statusDot.className = 'w-2 h-2 rounded-full bg-amber-400';
      statusText.textContent = 'Paused';

      btnSpeak.classList.remove('neon-glow-active');
      btnPause.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>Resume</span>
      `;
    } else {
      // Idle
      statusBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 bg-slate-800 text-slate-400 border border-slate-700';
      statusDot.className = 'w-2 h-2 rounded-full bg-slate-500';
      statusText.textContent = 'Idle';

      btnSpeak.classList.remove('neon-glow-active');
      btnPause.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span>Pause</span>
      `;
      btnPause.disabled = true;
      btnStop.disabled = true;

      resetKaraokeView();
    }
  });

  tts.on('boundary', (data) => {
    // 1. Modulate sound burst
    modulator.triggerWordBoundary(data.word);
    // 2. Highlight text in UI
    highlightWordAt(data.charIndex);
  });

  tts.on('end', (data) => {
    addHistoryItem({
      text: data.text,
      duration: data.duration,
      timestamp: new Date().toLocaleTimeString(),
      voiceName: voiceSelect.options[voiceSelect.selectedIndex] ? voiceSelect.options[voiceSelect.selectedIndex].text : 'Default Voice'
    });
  });

  tts.on('error', (err) => {
    console.warn('TTS playback issue:', err);
  });

  // ----------------------------------------------------------------
  // Speech Playback Actions
  // ----------------------------------------------------------------
  function handlePlay() {
    if (tts.isPaused()) {
      tts.resume();
      return;
    }

    const text = textInput.value.trim();
    if (!text) {
      textInput.focus();
      textInput.classList.add('ring-2', 'ring-rose-500');
      setTimeout(() => textInput.classList.remove('ring-2', 'ring-rose-500'), 800);
      return;
    }

    const selectedVoiceIdx = parseInt(voiceSelect.value, 10);
    const rate = parseFloat(rateSlider.value);
    const pitch = parseFloat(pitchSlider.value);
    const volume = parseFloat(volumeSlider.value);

    prepareKaraoke(text);

    tts.speak(text, {
      voiceIndex: isNaN(selectedVoiceIdx) ? 0 : selectedVoiceIdx,
      rate,
      pitch,
      volume
    });
  }

  btnSpeak.addEventListener('click', handlePlay);

  btnPause.addEventListener('click', () => {
    if (tts.isSpeaking()) {
      tts.pause();
    } else if (tts.isPaused()) {
      tts.resume();
    }
  });

  btnStop.addEventListener('click', () => {
    tts.stop();
  });

  btnClear.addEventListener('click', () => {
    tts.stop();
    textInput.value = '';
    updateTextStats();
    resetKaraokeView();
  });

  // ----------------------------------------------------------------
  // History Management & Replay
  // ----------------------------------------------------------------
  function addHistoryItem(item) {
    speechHistory.unshift(item);
    if (speechHistory.length > 20) speechHistory.pop();
    renderHistory();
  }

  function renderHistory() {
    if (speechHistory.length === 0) {
      if (emptyHistoryNotice) emptyHistoryNotice.classList.remove('hidden');
      return;
    }
    if (emptyHistoryNotice) emptyHistoryNotice.classList.add('hidden');

    historyList.innerHTML = '';
    speechHistory.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'glass-card p-3 rounded-xl flex items-center justify-between text-xs gap-3 group';
      
      const textPreview = item.text.length > 55 ? item.text.substring(0, 55) + '...' : item.text;

      card.innerHTML = `
        <div class="flex-1 min-w-0">
          <p class="font-medium text-slate-200 truncate">${textPreview}</p>
          <div class="flex items-center gap-2 mt-1 text-slate-400 text-[10px]">
            <span>${item.timestamp}</span>
            <span>•</span>
            <span class="truncate max-w-[120px] text-cyan-400">${item.voiceName.split('(')[0]}</span>
            <span>•</span>
            <span>${item.duration.toFixed(1)}s</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 opacity-90">
          <button data-replay="${idx}" title="Replay utterance" class="p-1.5 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
          </button>
          <button data-copy="${idx}" title="Copy text" class="p-1.5 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          </button>
        </div>
      `;
      historyList.appendChild(card);
    });

    // Replay buttons
    historyList.querySelectorAll('[data-replay]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-replay'), 10);
        if (speechHistory[idx]) {
          textInput.value = speechHistory[idx].text;
          updateTextStats();
          handlePlay();
        }
      });
    });

    // Copy buttons
    historyList.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-copy'), 10);
        if (speechHistory[idx]) {
          navigator.clipboard.writeText(speechHistory[idx].text);
          btn.innerHTML = `<svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
          setTimeout(() => {
            btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
          }, 1200);
        }
      });
    });
  }

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      speechHistory = [];
      historyList.innerHTML = '';
      if (emptyHistoryNotice) emptyHistoryNotice.classList.remove('hidden');
    });
  }

  // ----------------------------------------------------------------
  // Export Feature (JSON & TXT logs)
  // ----------------------------------------------------------------
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const text = textInput.value.trim();
      const exportData = {
        exportedAt: new Date().toISOString(),
        currentText: text,
        settings: {
          voice: voiceSelect.options[voiceSelect.selectedIndex] ? voiceSelect.options[voiceSelect.selectedIndex].text : 'Default',
          rate: parseFloat(rateSlider.value),
          pitch: parseFloat(pitchSlider.value),
          volume: parseFloat(volumeSlider.value)
        },
        history: speechHistory
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tts-session-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // ----------------------------------------------------------------
  // Visualizer Mode & Theme Controls
  // ----------------------------------------------------------------
  document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.getAttribute('data-mode');
      visualizer.setMode(mode);
      
      document.querySelectorAll('[data-mode]').forEach(b => {
        b.classList.remove('bg-cyan-500/30', 'text-cyan-300', 'border-cyan-400/50');
        b.classList.add('text-slate-400');
      });
      e.currentTarget.classList.add('bg-cyan-500/30', 'text-cyan-300', 'border-cyan-400/50');
      e.currentTarget.classList.remove('text-slate-400');
    });
  });

  document.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const theme = e.currentTarget.getAttribute('data-theme');
      visualizer.setTheme(theme);
    });
  });

  // Toggle Panel visibility for immersive full-screen 3D view
  if (btnTogglePanel && panel) {
    let isPanelVisible = true;
    btnTogglePanel.addEventListener('click', () => {
      isPanelVisible = !isPanelVisible;
      if (isPanelVisible) {
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
        btnTogglePanel.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
        `;
      } else {
        panel.style.transform = 'translateX(-115%)';
        panel.style.opacity = '0';
        btnTogglePanel.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
        `;
      }
    });
  }

  // ----------------------------------------------------------------
  // Keyboard Shortcuts
  // ----------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    // Prevent interfering if typing inside text fields
    if (e.target === textInput || e.target === voiceSearch) {
      if (e.key === 'Escape') {
        tts.stop();
        textInput.blur();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (tts.isSpeaking()) {
        tts.pause();
      } else if (tts.isPaused()) {
        tts.resume();
      } else {
        handlePlay();
      }
    } else if (e.key === 'Escape') {
      tts.stop();
    } else if (e.key === 'm' || e.key === 'M') {
      // Toggle next visualizer mode
      const modes = ['core', 'wave', 'vortex'];
      const nextIdx = (modes.indexOf(visualizer.currentMode) + 1) % modes.length;
      const targetBtn = document.querySelector(`[data-mode="${modes[nextIdx]}"]`);
      if (targetBtn) targetBtn.click();
    }
  });

  // ----------------------------------------------------------------
  // 2D Mini Waveform HUD Animation Loop
  // ----------------------------------------------------------------
  function hudLoop() {
    modulator.update(0.016);
    if (hudCanvas) {
      const activeThemeColor = visualizer.themes[visualizer.currentTheme] 
        ? '#' + visualizer.themes[visualizer.currentTheme].primary.toString(16).padStart(6, '0') 
        : '#06b6d4';
      modulator.drawHUDWaveform(hudCanvas, activeThemeColor);
    }
    requestAnimationFrame(hudLoop);
  }
  requestAnimationFrame(hudLoop);

  // Initialize
  syncParams();
  updateTextStats();
});
