/**
 * Web Audio API 기반 악기 사운드 엔진
 * 피아노, 스트링, 날카로운 어쿠스틱 기타(Acoustic Steel Pluck/Strum)
 */

import { midiToFrequency, type ChordNoteInfo } from './musicTheory';

export type InstrumentType = 'piano' | 'strings' | 'guitar';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  public async getAudioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('[SoundEngine] resume failed:', e);
      }
    }
    return this.ctx;
  }

  /**
   * 단음 재생 (가상 피아노 건반 직접 터치 시)
   */
  public async playNote(freq: number, instrument: InstrumentType = 'piano', duration = 1.2) {
    const ctx = await this.getAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    switch (instrument) {
      case 'piano':
        this.synthPianoTone(ctx, freq, now, duration);
        break;
      case 'strings':
        this.synthStringsTone(ctx, freq, now, duration * 1.5);
        break;
      case 'guitar':
        this.synthAcousticGuitarTone(ctx, freq, now, duration);
        break;
    }
  }

  /**
   * 코드 화음 재생
   */
  public async playChord(notes: ChordNoteInfo[], instrument: InstrumentType = 'piano') {
    if (!notes || notes.length === 0) return;
    const ctx = await this.getAudioContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime;

    if (instrument === 'guitar') {
      // 날카롭고 선명한 어쿠스틱 기타 6줄 스트럼 (Pick Strum 타건 간격 25ms)
      notes.forEach((note, idx) => {
        const strumTime = now + idx * 0.026;
        this.synthAcousticGuitarTone(ctx, note.freq, strumTime, 1.8);
      });
    } else if (instrument === 'strings') {
      // 스트링 패드: 오케스트라 앙상블
      notes.forEach((note) => {
        this.synthStringsTone(ctx, note.freq, now, 2.4);
      });
    } else {
      // 피아노: 그랜드 피아노 타격 및 공명
      notes.forEach((note) => {
        this.synthPianoTone(ctx, note.freq, now, 1.6);
      });
    }
  }

  /**
   * 🎹 피아노 톤 합성 (맑고 투명한 그랜드 피아노 해머 타격감 + 풍부한 배음)
   */
  private synthPianoTone(ctx: AudioContext, freq: number, startTime: number, duration: number) {
    if (!this.masterGain) return;

    // 1. 기본음 (기음: 맑은 Sine 파)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    // 2. 1차 배음 (현의 입체감: Triangle 파)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    // 3. 2차 고음 배음 (해머 벨 타격 광택감)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, startTime);

    // 저역 통과 필터: 고음역을 지나치게 깎지 않고 맑게 열어둠 (최대 6500Hz)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(freq * 6, 6800), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.8, 800), startTime + duration);

    // 피아노 게인 엔벨로프
    const gainNode1 = ctx.createGain();
    gainNode1.gain.setValueAtTime(0.0001, startTime);
    gainNode1.gain.linearRampToValueAtTime(0.35, startTime + 0.003); // 경쾌한 해머 어택 (3ms)
    gainNode1.gain.exponentialRampToValueAtTime(0.18, startTime + 0.12);
    gainNode1.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    const gainNode2 = ctx.createGain();
    gainNode2.gain.setValueAtTime(0.0001, startTime);
    gainNode2.gain.linearRampToValueAtTime(0.14, startTime + 0.005);
    gainNode2.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);

    const gainNode3 = ctx.createGain();
    gainNode3.gain.setValueAtTime(0.0001, startTime);
    gainNode3.gain.linearRampToValueAtTime(0.08, startTime + 0.003);
    gainNode3.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25); // 타격음 순간 벨소리

    osc1.connect(gainNode1);
    osc2.connect(gainNode2);
    osc3.connect(gainNode3);

    gainNode1.connect(filter);
    gainNode2.connect(filter);
    gainNode3.connect(filter);

    filter.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
    osc3.stop(startTime + duration);
  }

  /**
   * 스트링 톤 합성
   */
  private synthStringsTone(ctx: AudioContext, freq: number, startTime: number, duration: number) {
    if (!this.masterGain) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, startTime);
    osc1.detune.setValueAtTime(5, startTime);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(freq, startTime);
    osc2.detune.setValueAtTime(-5, startTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 2.4, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.18, startTime + 0.12);
    gainNode.gain.exponentialRampToValueAtTime(0.12, startTime + duration * 0.7);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
  }

  /**
   * 🌟 날카롭고 맑은 어쿠스틱 스틸 기타(Steel-string Acoustic Guitar) 합성
   * - 톱니파(Sawtooth)와 미세 스퀘어파를 결합하여 고음역 배음(Harmonics) 극대화
   * - 스틸 기타 픽(Pick) 타격 특유의 찰랑이는 고역대 하이패스/밴드패스(3.2kHz) 스파클링
   * - 급격한 어택(Attack: 2ms) 및 자연스러운 서스테인 댐핑
   */
  private synthAcousticGuitarTone(ctx: AudioContext, freq: number, startTime: number, duration: number) {
    if (!this.masterGain) return;

    // 1. 메인 현 진동 (밝은 톱니파)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, startTime);

    // 2. 픽 타격음 및 금속성 배음 (1옥타브 위 고음 배음)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.01, startTime);

    // 피크 찰랑임(Pick click) 화이트 노이즈 펄스 (10ms)
    const bufferSize = ctx.sampleRate * 0.015;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(3600, startTime);
    noiseFilter.Q.setValueAtTime(3.0, startTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.18, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.015);
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);

    // 기타 바디 및 스트링 필터 (맑고 날카로운 톤을 위해 브라이트 밴드패스/로우패스 결합)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // 시작 시 고역대를 5.5kHz까지 열어 날카로운 브라이트니스 부여
    filter.frequency.setValueAtTime(Math.min(freq * 8, 5800), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 600), startTime + 0.25);
    filter.Q.setValueAtTime(2.2, startTime); // 현의 찰랑이는 피크 공명

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.linearRampToValueAtTime(0.38, startTime + 0.002); // 순간 타격 (2ms)
    gainNode.gain.exponentialRampToValueAtTime(0.16, startTime + 0.08); // 1차 픽 어택 감쇠
    gainNode.gain.exponentialRampToValueAtTime(0.04, startTime + 0.6);  // 서스테인 울림
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    noiseSource.start(startTime);

    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);
    noiseSource.stop(startTime + 0.02);
  }
}

export const soundEngine = new SoundEngine();
