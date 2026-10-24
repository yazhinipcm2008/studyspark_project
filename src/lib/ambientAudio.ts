/**
 * Web Audio API procedural ambient soundscapes and notification chimes.
 * 100% self-contained, zero-dependency, works fully offline.
 */

export type AmbientSoundType = 'off' | 'rain' | 'whitenoise' | 'binaural' | 'forest' | 'cafe'

class AmbientAudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private currentType: AmbientSoundType = 'off'
  private isPlaying: boolean = false
  private activeNodes: { stop?: () => void; disconnect?: () => void }[] = []
  private volume: number = 0.5 // 0.0 to 1.0

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AudioCtx()
      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val))
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05)
    }
  }

  public getVolume(): number {
    return this.volume
  }

  public getCurrentType(): AmbientSoundType {
    return this.currentType
  }

  public isSoundPlaying(): boolean {
    return this.isPlaying
  }

  public stopAmbient() {
    this.activeNodes.forEach(node => {
      try {
        if (node.stop) node.stop()
        if (node.disconnect) node.disconnect()
      } catch (e) {
        // ignore already stopped
      }
    })
    this.activeNodes = []
    this.isPlaying = false
    this.currentType = 'off'
  }

  public playAmbient(type: AmbientSoundType) {
    this.stopAmbient()
    if (type === 'off') return

    const ctx = this.getContext()
    this.currentType = type
    this.isPlaying = true

    switch (type) {
      case 'rain':
        this.startRainSound(ctx)
        break
      case 'whitenoise':
        this.startWhiteNoise(ctx)
        break
      case 'binaural':
        this.startBinauralBeats(ctx)
        break
      case 'forest':
        this.startForestSound(ctx)
        break
      case 'cafe':
        this.startCafeSound(ctx)
        break
    }
  }

  /**
   * Generates procedural rain sound with lowpass filtered pink noise and random droplet impulses
   */
  private startRainSound(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 3
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
      b6 = white * 0.115926
    }

    const whiteNoise = ctx.createBufferSource()
    whiteNoise.buffer = noiseBuffer
    whiteNoise.loop = true

    // Lowpass filter for deep steady rain
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.setValueAtTime(1000, ctx.currentTime)

    // Gentle raindrop filter
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.setValueAtTime(180, ctx.currentTime)

    whiteNoise.connect(lowpass)
    lowpass.connect(highpass)
    highpass.connect(this.masterGain!)

    whiteNoise.start()
    this.activeNodes.push(whiteNoise, lowpass, highpass)
  }

  /**
   * Generates deep brown/pink focus noise
   */
  private startWhiteNoise(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    let lastOut = 0.0

    // Brown noise integration for softer, warmer tone
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      output[i] = (lastOut + 0.02 * white) / 1.02
      lastOut = output[i]
      output[i] *= 3.5 // boost gain
    }

    const brownSource = ctx.createBufferSource()
    brownSource.buffer = noiseBuffer
    brownSource.loop = true

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(800, ctx.currentTime)

    brownSource.connect(filter)
    filter.connect(this.masterGain!)

    brownSource.start()
    this.activeNodes.push(brownSource, filter)
  }

  /**
   * Generates 10Hz Alpha Binaural Beats for deep concentration
   * Left ear: 216Hz, Right ear: 226Hz (difference = 10Hz alpha rhythm)
   */
  private startBinauralBeats(ctx: AudioContext) {
    const merger = ctx.createChannelMerger(2)

    // Left oscillator (216 Hz)
    const oscL = ctx.createOscillator()
    oscL.type = 'sine'
    oscL.frequency.setValueAtTime(216, ctx.currentTime)

    const gainL = ctx.createGain()
    gainL.gain.setValueAtTime(0.25, ctx.currentTime)
    oscL.connect(gainL)
    gainL.connect(merger, 0, 0) // left channel

    // Right oscillator (226 Hz)
    const oscR = ctx.createOscillator()
    oscR.type = 'sine'
    oscR.frequency.setValueAtTime(226, ctx.currentTime)

    const gainR = ctx.createGain()
    gainR.gain.setValueAtTime(0.25, ctx.currentTime)
    oscR.connect(gainR)
    gainR.connect(merger, 0, 1) // right channel

    // Gentle warm background pad
    const padOsc = ctx.createOscillator()
    padOsc.type = 'triangle'
    padOsc.frequency.setValueAtTime(108, ctx.currentTime)
    const padGain = ctx.createGain()
    padGain.gain.setValueAtTime(0.08, ctx.currentTime)
    padOsc.connect(padGain)
    padGain.connect(merger, 0, 0)
    padGain.connect(merger, 0, 1)

    merger.connect(this.masterGain!)

    oscL.start()
    oscR.start()
    padOsc.start()

    this.activeNodes.push(oscL, oscR, padOsc, gainL, gainR, padGain, merger)
  }

  /**
   * Generates forest breeze with LFO-modulated wind gusts
   */
  private startForestSound(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.4
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true

    // Bandpass filter for wind howl/breeze
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(450, ctx.currentTime)
    filter.Q.setValueAtTime(2.5, ctx.currentTime)

    // LFO for swaying breeze effect
    const lfo = ctx.createOscillator()
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime) // 0.15 Hz slow breeze
    const lfoGain = ctx.createGain()
    lfoGain.gain.setValueAtTime(250, ctx.currentTime)

    lfo.connect(lfoGain)
    lfoGain.connect(filter.frequency)

    noise.connect(filter)
    filter.connect(this.masterGain!)

    noise.start()
    lfo.start()

    this.activeNodes.push(noise, filter, lfo, lfoGain)
  }

  /**
   * Generates soft coffee shop / cafe murmur warmth
   */
  private startCafeSound(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.3
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true

    const bandpass1 = ctx.createBiquadFilter()
    bandpass1.type = 'bandpass'
    bandpass1.frequency.setValueAtTime(650, ctx.currentTime)
    bandpass1.Q.setValueAtTime(1.8, ctx.currentTime)

    const bandpass2 = ctx.createBiquadFilter()
    bandpass2.type = 'lowpass'
    bandpass2.frequency.setValueAtTime(1200, ctx.currentTime)

    noise.connect(bandpass1)
    bandpass1.connect(bandpass2)
    bandpass2.connect(this.masterGain!)

    noise.start()
    this.activeNodes.push(noise, bandpass1, bandpass2)
  }

  /**
   * Plays a resonant Tibetan Singing Bowl / Glass Bell chord when timer completes
   */
  public playCompletionChime() {
    const ctx = this.getContext()
    const now = ctx.currentTime

    // Fundamental and harmonic bell frequencies
    const frequencies = [528, 1056, 1584, 2112] // 528Hz Solfeggio frequency
    const gains = [0.4, 0.2, 0.1, 0.05]

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = idx === 0 ? 'sine' : 'triangle'
      osc.frequency.setValueAtTime(freq, now)

      gain.gain.setValueAtTime(gains[idx] * this.volume, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + 3.6)
    })
  }
}

export const ambientAudio = new AmbientAudioEngine()
