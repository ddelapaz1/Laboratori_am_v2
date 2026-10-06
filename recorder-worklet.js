class FiveSecondRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(Math.round(sampleRate * 5));
    this.position = 0;
    this.lastProgress = 0;
  }

  process(inputs, outputs) {
    // The capture node never routes the microphone back to the speakers.
    for (const channel of outputs[0] || []) channel.fill(0);
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    const count = Math.min(channels[0].length, this.buffer.length - this.position);
    for (let i = 0; i < count; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i];
      this.buffer[this.position + i] = mono / channels.length;
    }
    this.position += count;
    if (this.position === this.buffer.length) {
      this.port.postMessage({ type: 'complete', samples: this.buffer, rate: sampleRate }, [this.buffer.buffer]);
      return false;
    }
    if (this.position - this.lastProgress >= sampleRate / 10) {
      this.port.postMessage({ type: 'progress', seconds: this.position / sampleRate });
      this.lastProgress = this.position;
    }
    return true;
  }
}

registerProcessor('five-second-recorder', FiveSecondRecorder);
