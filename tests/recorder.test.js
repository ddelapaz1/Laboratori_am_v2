import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

test('worklet captures exactly five seconds, averages channels, and emits no monitor audio', () => {
  const messages = [];
  let Processor;
  const rate = 48000;
  const context = vm.createContext({
    Float32Array, sampleRate: rate,
    AudioWorkletProcessor: class { port = { postMessage(message) { messages.push(message); } }; },
    registerProcessor(name, implementation) { assert.equal(name, 'five-second-recorder'); Processor = implementation; }
  });
  vm.runInContext(readFileSync(new URL('../recorder-worklet.js', import.meta.url), 'utf8'), context);
  const recorder = new Processor();
  const inputs = [[new Float32Array(128).fill(.2), new Float32Array(128).fill(.6)]];
  const outputs = [[new Float32Array(128).fill(1)]];
  let running = true, blocks = 0;
  while (running && blocks++ < 2000) running = recorder.process(inputs, outputs);
  assert.equal(running, false);
  assert.ok(outputs[0][0].every(value => value === 0));
  const complete = messages.filter(message => message.type === 'complete');
  assert.equal(complete.length, 1);
  assert.equal(complete[0].samples.length, rate * 5);
  assert.ok(complete[0].samples.every(value => Math.abs(value - .4) < 1e-6));
  assert.ok(messages.some(message => message.type === 'progress' && message.seconds > 4));
});
