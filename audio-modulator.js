/**
 * AudioModulator: Synthesizes high-fidelity acoustic envelope, spectral harmonics,
 * and syllable-reactive transient impulses for 3D WebGL and 2D mini-waveform visualizers.
 */
class AudioModulator {
  constructor() {
    this.isSpeaking = false;
    this.isPaused = false;
    
    // Acoustic Parameters
    this.speechRate = 1.0;
    this.speechPitch = 1.0;
    this.speechVolume = 1.0;

    // Signal state
    this.energy = 0;          // Smoothed audio energy (0 - 1)
    this.targetEnergy = 0;
    this.transientPulse = 0;   // Spike on word boundaries (0 - 1)
    this.phase = 0;
    
    // Simulated 64-band spectrum
    this.bandCount = 64;
    this.frequencies = new Float32Array(this.bandCount);
    
    // Vocal Formant approximations (Bass, Mid, Treble)
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
  }

  setSpeechState(state) {
    if (state === 'speaking') {
      this.isSpeaking = true;
      this.isPaused = false;
      this.targetEnergy = 0.85 * this.speechVolume;
    } else if (state === 'paused') {
      this.isSpeaking = false;
      this.isPaused = true;
      this.targetEnergy = 0.08;
    } else {
      this.isSpeaking = false;
      this.isPaused = false;
      this.targetEnergy = 0;
    }
  }

  setVoiceParams(rate, pitch, volume) {
    this.speechRate = rate || 1.0;
    this.speechPitch = pitch || 1.0;
    this.speechVolume = volume !== undefined ? volume : 1.0;
  }

  /**
   * Called on each word boundary to inject an acoustic burst
   */
  triggerWordBoundary(word) {
    const wordLength = word ? word.trim().length : 4;
    const boost = Math.min(1.0, 0.4 + (wordLength * 0.08));
    this.transientPulse = Math.min(1.0, this.transientPulse + boost);
  }

  /**
   * Updates acoustics using delta time
   */
  update(delta = 0.016) {
    const dt = Math.min(delta, 0.1);
    
    // Decay transient pulse
    this.transientPulse = Math.max(0, this.transientPulse - dt * 3.5);

    // Natural speech modulation
    if (this.isSpeaking) {
      this.phase += dt * (7.0 * this.speechRate);
      
      // Multi-harmonic modulation simulating vocal syllables and vowels
      const syllabicMod = (Math.sin(this.phase) * 0.3 + 
                           Math.sin(this.phase * 2.3 + 1.2) * 0.25 + 
                           Math.cos(this.phase * 4.1 + 0.4) * 0.15) * 0.4;
                           
      const dynamicEnergy = (0.65 + syllabicMod + this.transientPulse * 0.45) * this.speechVolume;
      this.targetEnergy = Math.max(0.15, Math.min(1.2, dynamicEnergy));
    } else {
      this.phase += dt * 0.8;
      this.targetEnergy = 0.02; // baseline idle breathing
    }

    // Smooth envelope interpolation (attack & decay)
    const lerpSpeed = this.isSpeaking ? 14.0 : 4.0;
    this.energy += (this.targetEnergy - this.energy) * (1.0 - Math.exp(-lerpSpeed * dt));

    // Update simulated frequency spectrum
    const pitchShift = this.speechPitch;
    const baseFreq = 0.18 * pitchShift;
    
    let sumBass = 0;
    let sumMid = 0;
    let sumTreble = 0;

    for (let i = 0; i < this.bandCount; i++) {
      const normalizedBand = i / this.bandCount;
      // Formant peaks: vocal resonance around index 10-18 (fundamental & vowel formants)
      const formant1 = Math.exp(-Math.pow((normalizedBand - 0.22) * 8.0, 2));
      const formant2 = Math.exp(-Math.pow((normalizedBand - 0.48) * 6.5, 2));
      const noise = (Math.sin(this.phase * 3.2 + i * 0.7) * 0.5 + 0.5);

      const amp = this.energy * (0.35 + 0.65 * (formant1 * 1.5 + formant2 * 0.9 + noise * 0.4));
      const targetAmp = Math.max(0.01, Math.min(1.0, amp));
      
      this.frequencies[i] += (targetAmp - this.frequencies[i]) * 0.35;

      if (i < 16) sumBass += this.frequencies[i];
      else if (i < 40) sumMid += this.frequencies[i];
      else sumTreble += this.frequencies[i];
    }

    this.bass = sumBass / 16;
    this.mid = sumMid / 24;
    this.treble = sumTreble / 24;
  }

  getAcousticData() {
    return {
      isSpeaking: this.isSpeaking,
      isPaused: this.isPaused,
      energy: this.energy,
      pulse: this.transientPulse,
      bass: this.bass,
      mid: this.mid,
      treble: this.treble,
      frequencies: this.frequencies,
      rate: this.speechRate,
      pitch: this.speechPitch
    };
  }

  /**
   * Renders real-time 2D waveform display to a HUD canvas
   */
  drawHUDWaveform(canvas, colorTheme = '#06b6d4') {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Subtle background grid line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    const points = 48;
    const sliceWidth = width / (points - 1);

    // Dynamic wave path
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const t = i / (points - 1);
      const freqIdx = Math.floor(t * (this.bandCount - 1));
      const freqVal = this.frequencies[freqIdx] || 0;
      
      const wave = Math.sin(this.phase * 4 + i * 0.45) * 
                   Math.cos(this.phase * 2.2 + i * 0.2);
                   
      const maxAmp = (height * 0.44);
      const amp = this.isSpeaking 
        ? (freqVal * 0.8 + this.transientPulse * 0.3 + 0.15) * maxAmp * wave
        : Math.sin(this.phase * 1.5 + i * 0.25) * 3;

      const y = centerY + amp;
      if (i === 0) {
        ctx.moveTo(0, y);
      } else {
        ctx.lineTo(i * sliceWidth, y);
      }
    }

    // Outer glow wave
    ctx.strokeStyle = colorTheme;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = colorTheme;
    ctx.shadowBlur = this.isSpeaking ? 16 : 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner bright core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }
}

window.AudioModulator = AudioModulator;
