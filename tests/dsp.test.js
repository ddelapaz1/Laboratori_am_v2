import test from 'node:test';
import assert from 'node:assert/strict';
import { lowpass, makeTone, recoverEnvelope, prepareVoice, peak, mean, correlation } from '../dsp.js';

const rate = 48000;
const sine = (frequency, seconds = 1) => Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin(2 * Math.PI * frequency * i / rate));
function rms(samples) { return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length); }

test('envelope detection recovers an unovermodulated tone', () => {
  const { original, recovered } = makeTone(440, .7);
  assert.ok(correlation(original, recovered) > .9999);
  assert.ok(Math.abs(rms(original) - rms(recovered)) < .001);
});

test('100% remains recoverable; 150% folds the negative envelope', () => {
  const clean = makeTone(440, 1);
  const folded = makeTone(440, 1.5);
  assert.ok(correlation(clean.original, clean.recovered) > .9999);
  assert.ok(correlation(folded.original, folded.recovered) < .98);
  assert.ok(Math.abs(mean(folded.recovered)) < .001);
});

test('zero modulation recovers silence rather than the source recording', () => {
  const recovered = recoverEnvelope(sine(440), 0, rate);
  assert.equal(peak(recovered), 0);
});

test('audio lowpass passes speech frequencies and cuts 3 kHz at -3 dB', () => {
  for (const [frequency, expected] of [[440, 1], [3000, Math.SQRT1_2], [6000, 0]]) {
    const input = sine(frequency);
    const output = lowpass(input, rate).slice(2400, -2400);
    const ratio = rms(output) / Math.SQRT1_2;
    assert.ok(Math.abs(ratio - expected) < .015, `${frequency} Hz: amplitude ratio ${ratio}`);
  }
});

test('five-second voice preparation removes DC, limits bandwidth, and supports reprocessing', () => {
  const voice = Float32Array.from({ length: rate * 5 }, (_, i) => .15 + .2 * Math.sin(2 * Math.PI * 700 * i / rate) + .1 * Math.sin(2 * Math.PI * 6000 * i / rate));
  const data = prepareVoice(voice, rate, .7);
  assert.equal(data.recovered.length, rate * 5);
  assert.ok(Math.abs(mean(data.original)) < 1e-6);
  assert.ok(Math.abs(peak(data.filtered) - 1) < 1e-6);
  assert.ok(correlation(data.filtered.slice(2400, -2400), data.recovered.slice(2400, -2400)) > .9999);
  const remodulated = recoverEnvelope(data.filtered, 1.5, rate);
  assert.ok(correlation(data.filtered.slice(2400, -2400), remodulated.slice(2400, -2400)) < .98);
});

test('silence and very low recordings remain finite without excessive normalization', () => {
  for (const input of [new Float32Array(rate), Float32Array.from(sine(440), x => x * 1e-6)]) {
    const data = prepareVoice(input, rate, 1.5);
    assert.ok(data.recovered.every(Number.isFinite));
    assert.ok(peak(data.filtered) < 1e-5);
  }
});
