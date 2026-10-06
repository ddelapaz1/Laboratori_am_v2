// Offline baseband model. RF is represented analytically in the plots, not
// sampled at the audio rate. Detection deliberately folds a negative envelope.
export function mean(samples) {
  let sum = 0;
  for (const value of samples) sum += value;
  return sum / (samples.length || 1);
}

export function peak(samples) {
  let result = 0;
  for (const value of samples) result = Math.max(result, Math.abs(value));
  return result;
}

function biquad(samples, rate, cutoff, q) {
  const omega = 2 * Math.PI * cutoff / rate;
  const cos = Math.cos(omega), alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / (2 * a0), b1 = 2 * b0, b2 = b0;
  const a1 = -2 * cos / a0, a2 = (1 - alpha) / a0;
  let x1 = samples[0] || 0, x2 = x1, y1 = x1, y2 = x1;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    samples[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
}

// Forward/backward Butterworth filtering preserves timing for A/B playback.
// Correct the cutoff so the combined response is -3 dB at 3 kHz.
export function lowpass(input, rate, cutoff = 3000, periodic = false) {
  if (input.length < 3) return Float32Array.from(input);
  if (cutoff >= rate / 2) throw new RangeError('Cutoff must be below Nyquist');
  const pad = Math.min(input.length - 1, Math.ceil(rate * .025));
  const data = new Float32Array(input.length + 2 * pad);
  data.set(input, pad);
  for (let i = 0; i < pad; i++) {
    data[pad - 1 - i] = periodic ? input[input.length - 1 - i] : 2 * input[0] - input[i + 1];
    data[pad + input.length + i] = periodic ? input[i] : 2 * input[input.length - 1] - input[input.length - 2 - i];
  }
  const corrected = rate / Math.PI * Math.atan(Math.tan(Math.PI * cutoff / rate) / Math.pow(Math.SQRT2 - 1, 1 / 8));
  for (let pass = 0; pass < 2; pass++) {
    biquad(data, rate, corrected, .541196100146197);
    biquad(data, rate, corrected, 1.306562964876377);
    data.reverse();
  }
  return data.slice(pad, pad + input.length);
}

export function recoverEnvelope(message, mu, rate, periodic = false) {
  if (mu === 0) return new Float32Array(message.length);
  const envelope = Float32Array.from(message, value => Math.abs(1 + mu * value));
  const dc = mean(envelope);
  for (let i = 0; i < envelope.length; i++) envelope[i] = (envelope[i] - dc) / mu;
  return lowpass(envelope, rate, 3000, periodic);
}

export function prepareVoice(samples, rate, mu) {
  const dc = mean(samples);
  const original = Float32Array.from(samples, value => value - dc);
  const filtered = lowpass(original, rate);
  const level = peak(filtered);
  // Silence stays silent; microphone self-noise is not amplified indefinitely.
  const normalizer = level > .001 ? 1 / level : 1;
  for (let i = 0; i < filtered.length; i++) filtered[i] *= normalizer;
  const recovered = recoverEnvelope(filtered, mu, rate);
  return { original, filtered, recovered, level };
}

export function makeTone(frequency, mu, rate = 48000) {
  const cycles = Math.max(1, Math.round(2 * frequency));
  const length = Math.round(cycles * rate / frequency);
  // An integer number of cycles makes the repeated audio buffer continuous.
  const original = Float32Array.from({ length }, (_, i) => Math.sin(2 * Math.PI * cycles * i / length));
  return { original, recovered: recoverEnvelope(original, mu, rate, true), rate };
}

export function correlation(a, b) {
  const offsetA = mean(a), offsetB = mean(b);
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - offsetA, y = b[i] - offsetB;
    ab += x * y; aa += x * x; bb += y * y;
  }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}
