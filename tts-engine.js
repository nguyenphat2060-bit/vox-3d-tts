/**
 * TTSEngine: High-reliability Web Speech API (SpeechSynthesis) Controller
 * Handles browser inconsistencies, Chrome 15s timeout quirks, async voice loading,
 * and high-frequency boundary events for visualizer synchrony.
 */
class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    this.isSupported = !!this.synth && 'SpeechSynthesisUtterance' in window;
    
    this.state = 'idle'; // 'idle' | 'speaking' | 'paused'
    this.currentUtterance = null;
    this.keepAliveInterval = null;
    this.startTime = 0;
    this.currentText = '';
    
    // Callback listeners
    this.listeners = {
      stateChange: [],
      boundary: [],
      voicesReady: [],
      error: [],
      end: []
    };

    if (this.isSupported) {
      this._initVoices();
    }
  }

  /**
   * Initializes voice fetching with multiple fallbacks for cross-browser reliability.
   */
  _initVoices() {
    const fetchVoices = () => {
      const available = this.synth.getVoices();
      if (available && available.length > 0) {
        this.voices = available;
        this._notify('voicesReady', this.voices);
        return true;
      }
      return false;
    };

    if (!fetchVoices()) {
      if (typeof this.synth.onvoiceschanged !== 'undefined') {
        this.synth.onvoiceschanged = () => {
          fetchVoices();
        };
      }
      // Polling fallback (necessary on some Edge/Chrome setups)
      let attempts = 0;
      const pollTimer = setInterval(() => {
        attempts++;
        if (fetchVoices() || attempts > 15) {
          clearInterval(pollTimer);
        }
      }, 150);
    }
  }

  /**
   * Register event listeners
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    // If voices are already loaded and someone registers 'voicesReady', fire immediately
    if (event === 'voicesReady' && this.voices.length > 0) {
      callback(this.voices);
    }
    return this;
  }

  _notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in TTSEngine listener for [${event}]:`, err);
        }
      });
    }
  }

  _setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this._notify('stateChange', { state: this.state });
    }
  }

  /**
   * Workaround for Chromium speech synthesis freezing after ~15s
   */
  _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveInterval = setInterval(() => {
      if (this.state === 'speaking' && this.synth.speaking && !this.synth.paused) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 9000);
  }

  _stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Main speech playback method
   * @param {string} text - Text to speak
   * @param {Object} options - { voiceIndex, rate, pitch, volume }
   */
  speak(text, options = {}) {
    if (!this.isSupported) {
      this._notify('error', new Error('Web Speech API is not supported in this browser.'));
      return false;
    }

    const cleanText = (text || '').trim();
    if (!cleanText) {
      this._notify('error', new Error('Please enter some text to synthesize.'));
      return false;
    }

    // Stop ongoing speech
    this.stop();

    this.currentText = cleanText;
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Apply voice settings
    const voices = this.getVoices();
    if (options.voiceIndex !== undefined && voices[options.voiceIndex]) {
      utterance.voice = voices[options.voiceIndex];
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
    }

    utterance.rate = Math.max(0.5, Math.min(2.0, options.rate !== undefined ? options.rate : 1.0));
    utterance.pitch = Math.max(0.1, Math.min(2.0, options.pitch !== undefined ? options.pitch : 1.0));
    utterance.volume = Math.max(0, Math.min(1.0, options.volume !== undefined ? options.volume : 1.0));

    // Handle Boundary Events (Word & Sentence triggers for 3D visualizer pulse)
    utterance.onboundary = (event) => {
      const charIndex = event.charIndex || 0;
      const charLength = event.charLength || 0;
      
      // Calculate word
      let word = '';
      if (charLength > 0) {
        word = cleanText.substring(charIndex, charIndex + charLength);
      } else {
        const slice = cleanText.substring(charIndex);
        const match = slice.match(/^(\S+)/);
        word = match ? match[1] : '';
      }

      const progress = cleanText.length > 0 ? (charIndex / cleanText.length) : 0;

      this._notify('boundary', {
        name: event.name,
        charIndex: charIndex,
        charLength: charLength,
        word: word,
        progress: progress,
        elapsedTime: event.elapsedTime
      });
    };

    utterance.onstart = () => {
      this.startTime = Date.now();
      this._setState('speaking');
      this._startKeepAlive();
    };

    utterance.onpause = () => {
      this._setState('paused');
    };

    utterance.onresume = () => {
      this._setState('speaking');
    };

    utterance.onend = () => {
      this._stopKeepAlive();
      const duration = (Date.now() - this.startTime) / 1000;
      this._setState('idle');
      this.currentUtterance = null;
      this._notify('end', {
        text: cleanText,
        duration: duration,
        timestamp: new Date().toISOString()
      });
    };

    utterance.onerror = (event) => {
      this._stopKeepAlive();
      // 'interrupted' and 'canceled' happen normally when the user clicks Stop/Restart
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.warn('SpeechSynthesis error:', event);
        this._notify('error', event);
      }
      this._setState('idle');
      this.currentUtterance = null;
    };

    this.currentUtterance = utterance;
    
    // Speak!
    try {
      this.synth.speak(utterance);
      return true;
    } catch (e) {
      console.error('TTS speak exception:', e);
      this._notify('error', e);
      return false;
    }
  }

  pause() {
    if (this.synth && this.state === 'speaking') {
      this.synth.pause();
      this._setState('paused');
    }
  }

  resume() {
    if (this.synth && this.state === 'paused') {
      this.synth.resume();
      this._setState('speaking');
    }
  }

  stop() {
    if (this.synth) {
      this._stopKeepAlive();
      this.synth.cancel();
      this._setState('idle');
      this.currentUtterance = null;
    }
  }

  getVoices() {
    if (this.voices.length > 0) return this.voices;
    if (this.synth) {
      this.voices = this.synth.getVoices();
    }
    return this.voices;
  }

  isSpeaking() {
    return this.state === 'speaking';
  }

  isPaused() {
    return this.state === 'paused';
  }
}

window.TTSEngine = TTSEngine;
