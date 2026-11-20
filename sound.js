// Synthesised sound cues for the chart (Web Audio, no sound files).
// Pitch follows the horizontal position on the sheet (a pentatonic scale from left to right), so elements of the
// same cluster share a register. Technologies ring as bells, events knock like a marimba, China's decision is a
// low drum, and every ending has its own chord.
(function () {
  "use strict";

  var PENTATONIC_STEPS = [0, 2, 4, 7, 9];
  var STORAGE_KEY = "history-pathways-sound";
  var audioContext = null;
  var masterGain = null;
  var reverbSend = null;
  var noiseBuffer = null;
  var enabled = true;
  try { enabled = localStorage.getItem(STORAGE_KEY) !== "off"; } catch (storageError) { /* default: sound on */ }

  function clampUnit(value) { return Math.min(1, Math.max(0, value)); }

  function reverbImpulse(context, durationSeconds) {
    var sampleCount = Math.floor(context.sampleRate * durationSeconds);
    var impulse = context.createBuffer(2, sampleCount, context.sampleRate);
    for (var channelIndex = 0; channelIndex < 2; channelIndex++) {
      var samples = impulse.getChannelData(channelIndex);
      for (var sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
        var remainingFraction = 1 - sampleIndex / sampleCount;
        samples[sampleIndex] = (Math.random() * 2 - 1) * remainingFraction * remainingFraction * remainingFraction;
      }
    }
    return impulse;
  }

  function ensureContext() {
    if (audioContext) return audioContext;
    var ContextClass = window.AudioContext || window.webkitAudioContext;
    if (!ContextClass) return null;
    audioContext = new ContextClass();
    var compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    compressor.connect(audioContext.destination);
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(compressor);
    var convolver = audioContext.createConvolver();
    convolver.buffer = reverbImpulse(audioContext, 2.6);
    var reverbReturn = audioContext.createGain();
    reverbReturn.gain.value = 0.3;
    convolver.connect(reverbReturn);
    reverbReturn.connect(masterGain);
    reverbSend = audioContext.createGain();
    reverbSend.gain.value = 1;
    reverbSend.connect(convolver);
    var noiseSampleCount = audioContext.sampleRate;
    noiseBuffer = audioContext.createBuffer(1, noiseSampleCount, audioContext.sampleRate);
    var noiseSamples = noiseBuffer.getChannelData(0);
    for (var sampleIndex = 0; sampleIndex < noiseSampleCount; sampleIndex++) noiseSamples[sampleIndex] = Math.random() * 2 - 1;
    return audioContext;
  }

  // Browsers only start audio after a click or key press; the page calls this from its Play handlers.
  function unlock() {
    if (!enabled) return;
    var context = ensureContext();
    if (context && context.state === "suspended") context.resume();
  }

  function ready() {
    return enabled && audioContext && audioContext.state === "running";
  }

  function frequencyAt(horizontalPosition, baseFrequency, octaveCount) {
    var stepCount = PENTATONIC_STEPS.length * octaveCount;
    var stepIndex = Math.round(clampUnit(horizontalPosition) * (stepCount - 1));
    var semitones = Math.floor(stepIndex / PENTATONIC_STEPS.length) * 12 + PENTATONIC_STEPS[stepIndex % PENTATONIC_STEPS.length];
    return baseFrequency * Math.pow(2, semitones / 12);
  }

  // One enveloped oscillator, sent dry to the master and wet to the reverb.
  function voice(settings) {
    var startTime = settings.startTime;
    var oscillator = audioContext.createOscillator();
    oscillator.type = settings.waveform || "sine";
    oscillator.frequency.setValueAtTime(settings.frequency, startTime);
    if (settings.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(settings.endFrequency, startTime + settings.attackSeconds + settings.decaySeconds * 0.6);
    var envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(settings.peakLevel, startTime + settings.attackSeconds);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + settings.attackSeconds + settings.decaySeconds);
    var lastNode = oscillator;
    if (settings.lowpassFrequency) {
      var filter = audioContext.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = settings.lowpassFrequency;
      oscillator.connect(filter);
      lastNode = filter;
    }
    lastNode.connect(envelope);
    envelope.connect(masterGain);
    var sendLevel = audioContext.createGain();
    sendLevel.gain.value = settings.reverbLevel === undefined ? 0.4 : settings.reverbLevel;
    envelope.connect(sendLevel);
    sendLevel.connect(reverbSend);
    oscillator.start(startTime);
    oscillator.stop(startTime + settings.attackSeconds + settings.decaySeconds + 0.05);
  }

  function noise(settings) {
    var source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    var filter = audioContext.createBiquadFilter();
    filter.type = settings.filterType || "bandpass";
    filter.frequency.value = settings.filterFrequency;
    var envelope = audioContext.createGain();
    envelope.gain.setValueAtTime(0.0001, settings.startTime);
    envelope.gain.linearRampToValueAtTime(settings.peakLevel, settings.startTime + settings.attackSeconds);
    envelope.gain.exponentialRampToValueAtTime(0.0001, settings.startTime + settings.attackSeconds + settings.decaySeconds);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    var sendLevel = audioContext.createGain();
    sendLevel.gain.value = settings.reverbLevel === undefined ? 0.3 : settings.reverbLevel;
    envelope.connect(sendLevel);
    sendLevel.connect(reverbSend);
    source.start(settings.startTime);
    source.stop(settings.startTime + settings.attackSeconds + settings.decaySeconds + 0.05);
  }

  // A technology: a small bell with inharmonic partials.
  function technology(horizontalPosition, delaySeconds) {
    if (!ready()) return;
    var startTime = audioContext.currentTime + (delaySeconds || 0);
    var frequency = frequencyAt(horizontalPosition, 523.25, 2);
    voice({ startTime: startTime, frequency: frequency, attackSeconds: 0.004, decaySeconds: 1.7, peakLevel: 0.13, reverbLevel: 0.55 });
    voice({ startTime: startTime, frequency: frequency * 2.76, attackSeconds: 0.002, decaySeconds: 0.6, peakLevel: 0.045, reverbLevel: 0.5 });
    voice({ startTime: startTime, frequency: frequency * 5.4, attackSeconds: 0.002, decaySeconds: 0.22, peakLevel: 0.02, reverbLevel: 0.4 });
  }

  // An event: a wooden knock. New events add a fifth; the point where a history diverges adds a tritone.
  function event(horizontalPosition, options, delaySeconds) {
    if (!ready()) return;
    var startTime = audioContext.currentTime + (delaySeconds || 0);
    var frequency = frequencyAt(horizontalPosition, 196, 2);
    voice({ startTime: startTime, frequency: frequency, waveform: "triangle", attackSeconds: 0.004, decaySeconds: 0.9, peakLevel: 0.24, reverbLevel: 0.35 });
    voice({ startTime: startTime, frequency: frequency * 4, attackSeconds: 0.002, decaySeconds: 0.1, peakLevel: 0.05, reverbLevel: 0.2 });
    noise({ startTime: startTime, filterFrequency: 2200, attackSeconds: 0.002, decaySeconds: 0.035, peakLevel: 0.05, reverbLevel: 0.15 });
    if (options && options.isNew) {
      voice({ startTime: startTime + 0.09, frequency: frequency * 1.5, waveform: "triangle", attackSeconds: 0.004, decaySeconds: 0.8, peakLevel: 0.11, reverbLevel: 0.45 });
    }
    if (options && options.isDivergence) {
      voice({ startTime: startTime + 0.02, frequency: frequency * Math.SQRT2, attackSeconds: 0.05, decaySeconds: 1.6, peakLevel: 0.1, reverbLevel: 0.6 });
      voice({ startTime: startTime, frequency: frequency / 2, attackSeconds: 0.02, decaySeconds: 1.4, peakLevel: 0.14, reverbLevel: 0.4 });
    }
  }

  // China's decision at the fork: a low drum with a faint gong.
  function decision(delaySeconds) {
    if (!ready()) return;
    var startTime = audioContext.currentTime + (delaySeconds || 0);
    voice({ startTime: startTime, frequency: 140, endFrequency: 52, attackSeconds: 0.005, decaySeconds: 0.9, peakLevel: 0.5, reverbLevel: 0.3 });
    noise({ startTime: startTime, filterType: "lowpass", filterFrequency: 420, attackSeconds: 0.003, decaySeconds: 0.22, peakLevel: 0.12 });
    voice({ startTime: startTime, frequency: 235, attackSeconds: 0.08, decaySeconds: 2.4, peakLevel: 0.04, reverbLevel: 0.7 });
  }

  var ENDING_CHORDS = {
    silicon_ascendancy: { frequencies: [523.25, 783.99, 1174.66, 1567.98], waveform: "sine", attackSeconds: 0.6, decaySeconds: 4.2, peakLevel: 0.07 },
    corporate_dominion: { frequencies: [261.63, 329.63, 392.0, 493.88], waveform: "sawtooth", lowpassFrequency: 1400, attackSeconds: 0.35, decaySeconds: 3.4, peakLevel: 0.05 },
    time: { frequencies: [261.63, 349.23, 392.0, 523.25], waveform: "triangle", attackSeconds: 0.8, decaySeconds: 4.0, peakLevel: 0.07 },
    panopticon_peace: { frequencies: [130.81, 185.0, 261.63, 370.0], waveform: "sine", attackSeconds: 0.9, decaySeconds: 4.4, peakLevel: 0.08 },
    butlerian_accord: { frequencies: [196.0, 246.94, 293.66, 392.0], waveform: "triangle", attackSeconds: 0.5, decaySeconds: 4.0, peakLevel: 0.08 },
    great_collapse: { frequencies: [65.41, 69.3, 98.0, 103.83], waveform: "sawtooth", lowpassFrequency: 500, attackSeconds: 0.25, decaySeconds: 4.6, peakLevel: 0.09, rumble: true },
    ousted: { frequencies: [220.0, 261.63, 329.63], waveform: "triangle", attackSeconds: 0.3, decaySeconds: 3.0, peakLevel: 0.08, falling: true },
  };

  // An ending: a chord of its own, swelling and dying away.
  function ending(endingKey, delaySeconds) {
    if (!ready()) return;
    var chord = ENDING_CHORDS[endingKey] || ENDING_CHORDS.time;
    var startTime = audioContext.currentTime + (delaySeconds || 0);
    chord.frequencies.forEach(function (frequency, noteIndex) {
      voice({
        startTime: startTime + noteIndex * 0.05, frequency: frequency, endFrequency: chord.falling ? frequency * 0.75 : undefined,
        waveform: chord.waveform, lowpassFrequency: chord.lowpassFrequency,
        attackSeconds: chord.attackSeconds, decaySeconds: chord.decaySeconds, peakLevel: chord.peakLevel, reverbLevel: 0.7,
      });
    });
    if (chord.rumble) noise({ startTime: startTime, filterType: "lowpass", filterFrequency: 160, attackSeconds: 0.6, decaySeconds: 4.0, peakLevel: 0.35, reverbLevel: 0.5 });
  }

  function setEnabled(isEnabled) {
    enabled = isEnabled;
    try { localStorage.setItem(STORAGE_KEY, isEnabled ? "on" : "off"); } catch (storageError) { /* the choice lasts this visit only */ }
    if (isEnabled) unlock();
    else if (audioContext && audioContext.state === "running") audioContext.suspend();
  }

  window.HistorySound = {
    unlock: unlock,
    isEnabled: function () { return enabled; },
    setEnabled: setEnabled,
    technology: technology,
    event: event,
    decision: decision,
    ending: ending,
  };
})();
