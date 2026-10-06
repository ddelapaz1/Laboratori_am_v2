import { recoverEnvelope, prepareVoice, makeTone, peak } from './dsp.js';

'use strict';
const carrier=document.getElementById('carrier'),tone=document.getElementById('tone'),depth=document.getElementById('depth');
const fmt=new Intl.NumberFormat('ca-ES');let audio = null;
let toneData = null;
let toneKey = '';
let voiceData = null;
let recording = null;
let recordingPending = false;
let mode = 'tone';
function values(){return {fc:Number(carrier.value),fm:Number(tone.value),mu:Number(depth.value)/100}}
function plot(id,fn,color,limit,T,envelope){const canvas=document.getElementById(id),w=canvas.clientWidth,h=canvas.clientHeight,dpr=window.devicePixelRatio||1;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const L=55,R=w-17,top=23,B=h-43;const x=t=>L+t/T*(R-L),y=v=>top+(limit-v)/(2*limit)*(B-top);c.font='12px system-ui';c.lineWidth=1;c.strokeStyle='#273b53';c.fillStyle='#a9bbd0';c.textAlign='right';for(const v of [-limit,0,limit]){c.beginPath();c.moveTo(L,y(v));c.lineTo(R,y(v));c.stroke();c.fillText(String(v).replace('.',','),L-9,y(v)+4)}const ticks=id==='c1'?(w<420?2:5):(w<420?3:6);c.textAlign='center';for(let k=0;k<=ticks;k++){const t=T*k/ticks;c.beginPath();c.moveTo(x(t),top);c.lineTo(x(t),B);c.stroke();c.fillText((t*1000).toFixed(2).replace('.',','),x(t),B+19)}c.textAlign='left';c.fillText('Amplitud (u. a.)',L,14);c.textAlign='right';c.fillText('Temps (ms)',R,h-5);function line(f,col,dash=[]){c.beginPath();c.strokeStyle=col;c.lineWidth=dash.length?1.5:1.6;c.setLineDash(dash);const n=Math.max(1600,Math.ceil((values().fc+values().fm)*T*36));for(let i=0;i<=n;i++){const t=T*i/n;if(i===0)c.moveTo(x(t),y(f(t)));else c.lineTo(x(t),y(f(t)))}c.stroke();c.setLineDash([])}line(fn,color);if(envelope){line(envelope,'#eabf71',[6,5]);line(t=>-envelope(t),'#eabf71',[6,5])}}

function spectralLines(fc,fm,mu){
 const bins=new Map();
 function add(f,re,im,label){const b=bins.get(f)||{f,re:0,im:0,labels:new Set()};b.re+=re;b.im+=im;b.labels.add(label);bins.set(f,b)}
 add(fc,.5,0,'Portadora');add(-fc,.5,0,'Portadora');
 if(mu>0)for(const [f,label] of [[fm+fc,'Banda suma'],[fm-fc,'Banda diferència']]){add(f,0,-mu/4,label);add(-f,0,mu/4,label)}
 return [...bins.values()].filter(b=>b.f>=0).map(b=>({f:b.f,amplitude:Math.hypot(b.re,b.im)*(b.f===0?1:2),label:[...b.labels].join(' + ')})).filter(b=>b.amplitude>1e-12).sort((a,b)=>a.f-b.f);
}
function drawSpectrum(){
 const {fc,fm,mu}=values(),lines=spectralLines(fc,fm,mu),canvas=document.getElementById('spectrum'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=window.devicePixelRatio||1;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);
 const L=55,R=w-20,top=30,B=h-48;
 const lo=Math.min(fc,Math.abs(fc-fm)),hi=fc+fm,pad=Math.max((hi-lo)*.15,50),min=Math.max(0,lo-pad),max=hi+pad;
 const x=f=>L+(f-min)/(max-min)*(R-L),y=a=>B-a/1.2*(B-top);
 c.font='12px system-ui';c.lineWidth=1;c.strokeStyle='#273b53';c.fillStyle='#adbed1';
 for(const a of [0,.5,1]){c.beginPath();c.moveTo(L,y(a));c.lineTo(R,y(a));c.stroke();c.textAlign='right';c.fillText(fmt.format(a),L-9,y(a)+4)}
 const ticks=w<420?3:4;
 for(let i=0;i<=ticks;i++){const f=min+(max-min)*i/ticks;c.beginPath();c.moveTo(x(f),top);c.lineTo(x(f),B);c.stroke();c.textAlign=i===0?'left':i===ticks?'right':'center';c.fillText(fmt.format(Math.round(f/10)/100),x(f),B+20)}
 c.textAlign='left';c.fillText('Amplitud (u. a.)',L,16);c.textAlign='right';c.fillText('Freqüència (kHz)',R,h-5);
 for(const line of lines){const px=x(line.f),py=y(line.amplitude),col=line.label.includes('Portadora')?'#77baff':'#eabf71';c.strokeStyle=col;c.fillStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(px,B);c.lineTo(px,py);c.stroke();c.beginPath();c.moveTo(px,py-3);c.lineTo(px-4,py+5);c.lineTo(px+4,py+5);c.closePath();c.fill()}
 document.getElementById('spectrum-rows').innerHTML=lines.map(l=>'<tr><td>'+l.label+'</td><td>'+fmt.format(l.f)+' Hz</td><td>'+fmt.format(Number(l.amplitude.toFixed(4)))+'</td></tr>').join('');
 let note='Portadora: f꜀, amplitud 1. Bandes laterals: f꜀ − fₘ i f꜀ + fₘ, amplitud μ/2 cadascuna.';
 if(mu===0)note='Amb μ = 0 no hi ha bandes laterals: només queda la portadora.';
 else if(fm===fc)note='Amb fₘ = f꜀, la banda diferència és nul·la: sin(0) = 0. Queden la portadora i la banda suma a 2f꜀.';
 else if(fm>fc)note='Amb fₘ > f꜀, la banda diferència apareix a |f꜀ − fₘ|. Si coincideix amb la portadora, se sumen els coeficients complexos abans de calcular l’amplitud.';
 if(mu>1)note+=' En aquest model lineal ideal, superar el 100 % no crea noves deltes: la distorsió apareix en detectar l’envolupant.';document.getElementById('spectrum-note').textContent=note;
 canvas.setAttribute('aria-label','Espectre AM: '+lines.map(l=>l.label+' a '+fmt.format(l.f)+' Hz, amplitud '+fmt.format(l.amplitude)).join('; '));
}

function update(changed="all"){const {fc,fm,mu}=values();document.getElementById('carrier-value').textContent=fmt.format(fc)+' Hz';document.getElementById('tone-value').textContent=fmt.format(fm)+' Hz';document.getElementById('depth-value').textContent=Math.round(mu*100)+' %';document.getElementById('carrier-caption').textContent=fmt.format(fc)+' Hz · 0–0,5 ms';document.getElementById('tone-caption').textContent=fm+' Hz · sinus';document.getElementById('am-caption').textContent='μ = '+mu.toFixed(2).replace('.',',');document.getElementById('modulation-status').textContent=mu>1?'Sobremodulació: el contorn es replega i un detector d’envolupant distorsiona el missatge.':mu===1?'100 %: el contorn arriba a zero.':mu===0?'0 %: només es transmet la portadora.':'Modulació inferior al 100 %.';const T=10/3000,mod=t=>Math.sin(2*Math.PI*fm*t),car=t=>Math.cos(2*Math.PI*fc*t),env=t=>1+mu*mod(t);if(changed==='all'||changed==='carrier')plot('c1',car,'#77baff',1.2,.0005);if(changed==='all'||changed==='tone')plot('c2',mod,'#4ee0bc',1.2,T);plot('c3',t=>env(t)*car(t),'#d1a3ff',2.7,T,t=>Math.abs(env(t)));drawSpectrum();updateToneComparison(); if (playback?.kind.startsWith('tone-')) playAudio(playback.kind, true).catch(audioError)}
for(const el of [carrier,tone,depth])el.addEventListener('input',()=>update(el.id));
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'configure_am',description:'Configura la portadora, el to i l’índex de modulació sense activar el so.',inputSchema:{type:'object',properties:{carrierHz:{type:'number',minimum:2000,maximum:20000},toneHz:{type:'integer',minimum:50,maximum:3000},modulationPercent:{type:'number',minimum:0,maximum:150}},required:['carrierHz','toneHz','modulationPercent'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!Number.isFinite(input.carrierHz)||input.carrierHz<2000||input.carrierHz>20000||input.carrierHz%100!==0||(!Number.isInteger(input.toneHz)||input.toneHz<50||input.toneHz>3000)||!Number.isInteger(input.modulationPercent)||input.modulationPercent<0||input.modulationPercent>150)throw Error('Paràmetres fora de rang');carrier.value=input.carrierHz;tone.value=input.toneHz;depth.value=input.modulationPercent;update();return values()}})).catch(()=>{})}catch(e){}}

// Audio playback: one source at a time, with shared playhead for comparisons.
let playback = null;
let audioRequest = 0;
let recorderLoaded = false;
const audioButtons = {
  'tone-original': document.getElementById('listen'),
  'tone-recovered': document.getElementById('listen-recovered'),
  'voice-original': document.getElementById('voice-original'),
  'voice-filtered': document.getElementById('voice-filtered'),
  'voice-recovered': document.getElementById('voice-recovered')
};
const audioLabels = {
  'tone-original': 'Escoltant la moduladora original',
  'tone-recovered': 'Escoltant el missatge recuperat',
  'voice-original': 'Escoltant la gravació original',
  'voice-filtered': 'Escoltant l’original limitada a 3 kHz',
  'voice-recovered': 'Escoltant la veu recuperada d’AM'
};

async function ensureAudio() {
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  await audio.resume();
  return audio;
}

function syncPlaybackUI() {
  for (const [kind, button] of Object.entries(audioButtons)) button.setAttribute('aria-pressed', String(playback?.kind === kind));
  for (const button of document.querySelectorAll('.stop-audio')) button.disabled = !playback;
}

function stopAudio() {
  audioRequest++;
  if (playback) {
    const old = playback;
    playback = null;
    old.source.onended = null;
    old.gain.gain.cancelScheduledValues(audio.currentTime);
    old.gain.gain.setTargetAtTime(0, audio.currentTime, .008);
    old.source.stop(audio.currentTime + .06);
    old.source.addEventListener('ended', () => { old.source.disconnect(); old.gain.disconnect(); }, { once: true });
  }
  syncPlaybackUI();
  document.getElementById('audio-status').textContent = 'So desactivat';
  document.getElementById('voice-audio-status').textContent = 'So desactivat';
}

function playbackGain(samples) {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length), maximum = peak(samples);
  return rms > 1e-7 && maximum ? Math.min(.12 / rms, .75 / maximum, 50) : 0;
}

async function playAudio(kind, refresh = false) {
  if (recording || recordingPending) return;
  if (!refresh && playback?.kind === kind) { stopAudio(); return; }
  const token = ++audioRequest;
  await ensureAudio();
  if (token !== audioRequest) return;
  const isTone = kind.startsWith('tone-');
  const data = isTone ? toneData : voiceData;
  if (!data) return;
  const samples = data[kind.split('-')[1]];
  const duration = samples.length / data.rate;
  let offset = 0;
  if (playback && playback.kind.startsWith(isTone ? 'tone-' : 'voice-')) {
    offset = (playback.offset + audio.currentTime - playback.startedAt) % duration;
  }
  stopAudio();
  const buffer = audio.createBuffer(1, samples.length, data.rate);
  buffer.copyToChannel(samples, 0);
  const source = audio.createBufferSource(), gain = audio.createGain();
  source.buffer = buffer;
  source.loop = isTone;
  source.connect(gain).connect(audio.destination);
  const level = playbackGain(samples);
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(level, audio.currentTime, .012);
  if (!isTone) {
    const fadeStart = audio.currentTime + Math.max(0, duration - offset - .03);
    gain.gain.setTargetAtTime(0, fadeStart, .008);
  }
  playback = { kind, source, gain, offset, startedAt: audio.currentTime };
  source.onended = () => {
    if (playback?.source !== source) return;
    playback = null;
    source.disconnect(); gain.disconnect();
    syncPlaybackUI();
    document.getElementById('voice-audio-status').textContent = 'Reproducció acabada. Selecciona un àudio per repetir-la.';
  };
  source.start(0, offset);
  syncPlaybackUI();
  const status = document.getElementById(isTone ? 'audio-status' : 'voice-audio-status');
  status.textContent = samples.some(value => Math.abs(value) > 1e-7) ? audioLabels[kind] : 'Sense missatge recuperat: amb μ = 0 només es transmet la portadora.';
}

function audioError(error) {
  console.error(error);
  document.getElementById(mode === 'tone' ? 'audio-status' : 'voice-audio-status').textContent = 'No s’ha pogut reproduir l’àudio en aquest navegador.';
}
for (const [kind, button] of Object.entries(audioButtons)) button.addEventListener('click', () => playAudio(kind).catch(audioError));
for (const button of document.querySelectorAll('.stop-audio')) button.addEventListener('click', stopAudio);

// Reusable plot primitives; waveforms are reduced with min/max buckets so a
// five-second recording remains readable without losing narrow peaks.
function axes(id, duration, limit, unit = 's') {
  const canvas = document.getElementById(id), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const left = 55, right = w - 20, top = 25, bottom = h - 42;
  const x = t => left + t / duration * (right - left);
  const y = value => top + (limit - value) / (2 * limit) * (bottom - top);
  ctx.font = '12px system-ui'; ctx.strokeStyle = '#273b53'; ctx.fillStyle = '#a9bbd0'; ctx.lineWidth = 1;
  for (const value of [-limit, 0, limit]) {
    ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(right, y(value)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(fmt.format(value), left - 8, y(value) + 4);
  }
  const ticks = w < 420 ? 3 : 5;
  for (let i = 0; i <= ticks; i++) {
    const t = duration * i / ticks;
    ctx.beginPath(); ctx.moveTo(x(t), top); ctx.lineTo(x(t), bottom); ctx.stroke();
    ctx.textAlign = i === 0 ? 'left' : i === ticks ? 'right' : 'center';
    ctx.fillText(fmt.format(Number(t.toFixed(unit === 'μs' ? 0 : 2))), x(t), bottom + 19);
  }
  ctx.textAlign = 'left'; ctx.fillText('Amplitud (u. a.)', left, 14);
  ctx.textAlign = 'right'; ctx.fillText('Temps (' + unit + ')', right, h - 5);
  return { ctx, x, y, left, right, top, bottom };
}

function drawSamples(chart, samples, rate, duration, color, secondsPerUnit = 1) {
  const { ctx, x, y, left, right } = chart;
  const count = Math.min(samples.length, Math.ceil(duration * secondsPerUnit * rate));
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
  const pixels = Math.ceil(right - left);
  if (count > pixels * 3) {
    for (let pixel = 0; pixel < pixels; pixel++) {
      const start = Math.floor(pixel * count / pixels), end = Math.floor((pixel + 1) * count / pixels);
      let lo = Infinity, hi = -Infinity;
      for (let i = start; i < end; i++) { lo = Math.min(lo, samples[i]); hi = Math.max(hi, samples[i]); }
      const px = x(pixel / pixels * duration);
      ctx.moveTo(px, y(lo)); ctx.lineTo(px, y(hi));
    }
  } else {
    for (let i = 0; i < count; i++) {
      const px = x(i / rate / secondsPerUnit), py = y(samples[i]);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
  }
  ctx.stroke();
}

function updateToneComparison() {
  const { fm, mu, fc } = values(), key = fm + ':' + mu;
  if (key !== toneKey) { toneData = makeTone(fm, mu); toneKey = key; }
  const durationMs = 3 / fm * 1000;
  const chart = axes('comparison', durationMs, 1.3, 'ms');
  if (chart) {
    drawSamples(chart, toneData.original, toneData.rate, durationMs, '#4ee0bc', .001);
    drawSamples(chart, toneData.recovered, toneData.rate, durationMs, '#d1a3ff', .001);
  }
  document.getElementById('comparison-caption').textContent = '3 cicles de la moduladora · detector d’envolupant';
  let note = mu === 0 ? 'Amb μ = 0 no s’envia el missatge: la recuperada és silenci.' : mu > 1 ? 'Sobremodulació: l’envolupant es plega i el missatge recuperat es distorsiona.' : 'El detector ideal recupera el missatge. El filtre d’àudio a 3 kHz atenua els tons propers al tall.';
  if (fc < 5 * fm) note += ' Aquí la portadora és propera a la moduladora: aquesta recuperació ideal pressuposa una portadora molt més alta. Prova d’augmentar-la.';
  document.getElementById('recovery-note').textContent = note;
}

// Accessible mode selection, including keyboard navigation.
const tabs = [document.getElementById('tone-tab'), document.getElementById('voice-tab')];
function setMode(next) {
  if (mode === next) return;
  stopAudio(); cancelRecording(); mode = next;
  for (const tab of tabs) {
    const active = tab.id === next + '-tab';
    tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (next === 'tone') update(); else drawVoice();
}
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => setMode(index ? 'voice' : 'tone'));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    setMode(next ? 'voice' : 'tone'); tabs[next].focus();
  });
}

const recordButton = document.getElementById('record');
const recordStatus = document.getElementById('record-status');
const recordProgress = document.getElementById('record-progress');
let recordingGeneration = 0;
function cleanupRecording() {
  if (!recording) return;
  clearTimeout(recording.timeout);
  recording.node.port.onmessage = null;
  recording.node.disconnect(); recording.input.disconnect();
  for (const track of recording.stream.getTracks()) track.stop();
  recording = null;
}
function finishRecordingUI() {
  recordingPending = false;
  recordButton.textContent = 'Grava 5 segons'; recordButton.disabled = false;
  recordProgress.hidden = true;
  for (const button of Object.values(audioButtons)) button.disabled = false;
}
function cancelRecording() {
  if (!recording && !recordingPending) return;
  recordingGeneration++;
  cleanupRecording(); finishRecordingUI();
  recordStatus.textContent = 'Gravació cancel·lada. Pots tornar-ho a provar.';
}
async function startRecording() {
  if (recording || recordingPending) { cancelRecording(); return; }
  stopAudio(); recordingPending = true;
  const generation = ++recordingGeneration;
  recordButton.textContent = 'Cancel·la';
  recordStatus.textContent = 'Esperant l’accés al micròfon…';
  for (const button of Object.values(audioButtons)) button.disabled = true;
  let stream = null;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MicrophoneUnavailable');
    const context = await ensureAudio();
    if (generation !== recordingGeneration) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (generation !== recordingGeneration) { for (const track of stream.getTracks()) track.stop(); return; }
    if (!recorderLoaded) { await context.audioWorklet.addModule('./recorder-worklet.js'); recorderLoaded = true; }
    if (generation !== recordingGeneration) { for (const track of stream.getTracks()) track.stop(); return; }
    const input = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'five-second-recorder');
    recording = { stream, input, node, timeout: null };
    recordingPending = false; recordProgress.hidden = false; recordProgress.value = 0;
    recordStatus.textContent = 'Gravant… queden 5,0 s';
    node.port.onmessage = ({ data }) => {
      if (generation !== recordingGeneration) return;
      if (data.type === 'progress') {
        recordProgress.value = data.seconds;
        recordStatus.textContent = 'Gravant… queden ' + fmt.format(Number((5 - data.seconds).toFixed(1))) + ' s';
      } else if (data.type === 'complete') {
        cleanupRecording(); finishRecordingUI();
        voiceData = { ...prepareVoice(data.samples, data.rate, Number(voiceDepth.value) / 100), samples: data.samples, rate: data.rate };
        document.getElementById('voice-empty').hidden = true;
        document.getElementById('voice-results').hidden = false;
        recordStatus.textContent = voiceData.level < .001 ? 'Gravació molt baixa o en silenci. Prova de parlar més a prop del micròfon.' : 'Gravació de 5 segons preparada. Pots escoltar-la o canviar la modulació.';
        buildVoiceSpectra(); drawVoice();
      }
    };
    recording.timeout = setTimeout(() => {
      cancelRecording(); recordStatus.textContent = 'El micròfon no ha proporcionat prou àudio. Torna-ho a provar.';
    }, 12000);
    stream.getTracks()[0].addEventListener('ended', () => {
      if (recording?.stream === stream) { cancelRecording(); recordStatus.textContent = 'El micròfon s’ha desconnectat. Torna-ho a provar.'; }
    });
    input.connect(node).connect(context.destination);
  } catch (error) {
    if (stream) for (const track of stream.getTracks()) track.stop();
    if (generation !== recordingGeneration) return;
    cleanupRecording(); finishRecordingUI();
    recordStatus.textContent = error.name === 'NotAllowedError' ? 'Accés al micròfon denegat. Permet-lo al navegador per gravar.' : error.name === 'NotFoundError' ? 'No s’ha trobat cap micròfon.' : 'No s’ha pogut gravar. Obre la web a localhost o amb HTTPS i comprova el micròfon.';
    console.error(error);
  }
}
recordButton.addEventListener('click', startRecording);

const voiceCarrier = document.getElementById('voice-carrier');
const voiceDepth = document.getElementById('voice-depth');
const voicePosition = document.getElementById('voice-position');
let voiceUpdateFrame = 0;
voiceDepth.addEventListener('input', () => {
  document.getElementById('voice-depth-value').textContent = voiceDepth.value + ' %';
  cancelAnimationFrame(voiceUpdateFrame);
  voiceUpdateFrame = requestAnimationFrame(() => {
    if (voiceData) {
      voiceData.recovered = recoverEnvelope(voiceData.filtered, Number(voiceDepth.value) / 100, voiceData.rate);
      buildVoiceSpectra();
      if (playback?.kind === 'voice-recovered') playAudio('voice-recovered', true).catch(audioError);
    }
    drawVoice();
  });
});
voiceCarrier.addEventListener('input', drawVoice);
voicePosition.addEventListener('input', drawVoiceRF);

function drawVoice() {
  document.getElementById('voice-carrier-value').textContent = fmt.format(Number(voiceCarrier.value) / 1000) + ' kHz';
  document.getElementById('voice-depth-value').textContent = voiceDepth.value + ' %';
  if (!voiceData || mode !== 'voice') return;
  const mu = Number(voiceDepth.value) / 100;
  const quality = document.getElementById('voice-quality');
  quality.classList.toggle('warning', mu > 1 || mu === 0);
  quality.textContent = mu === 0 ? '0 %: només hi ha portadora. No es recupera la veu.' : mu > 1 ? 'Sobremodulació: els pics de veu poden plegar l’envolupant i distorsionar el missatge. Compara amb un índex del 70 %.' : 'Modulació dins del 100 %: es recupera la informació limitada a 3 kHz, amb el filtratge del receptor.';
  const chart = axes('voice-waveform', 5, 1.3);
  if (chart) {
    chart.ctx.globalAlpha = .8;
    drawSamples(chart, voiceData.filtered, voiceData.rate, 5, '#4ee0bc');
    chart.ctx.globalAlpha = .85;
    drawSamples(chart, voiceData.recovered, voiceData.rate, 5, '#d1a3ff');
    chart.ctx.globalAlpha = 1;
  }
  drawVoiceRF(); drawVoiceSpectrum();
}

function drawVoiceRF() {
  if (!voiceData || mode !== 'voice') return;
  const fc = Number(voiceCarrier.value), mu = Number(voiceDepth.value) / 100;
  const offset = Number(voicePosition.value) / 1000, duration = .00005;
  document.getElementById('voice-position-value').textContent = fmt.format(offset) + ' s';
  document.getElementById('voice-rf-caption').textContent = fmt.format(fc / 1000) + ' kHz · μ = ' + fmt.format(mu);
  const chart = axes('voice-rf', 50, 2.7, 'μs');
  if (!chart) return;
  const message = time => {
    const index = Math.min(voiceData.filtered.length - 2, time * voiceData.rate);
    const first = Math.floor(index), fraction = index - first;
    return voiceData.filtered[first] * (1 - fraction) + voiceData.filtered[first + 1] * fraction;
  };
  const count = Math.max(1000, Math.ceil(fc * duration * 36));
  function trace(fn, color, dash = []) {
    const { ctx, x, y } = chart;
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash(dash);
    for (let i = 0; i <= count; i++) {
      const t = duration * i / count;
      const px = x(t * 1e6), py = y(fn(t));
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  trace(t => (1 + mu * message(offset + t)) * Math.cos(2 * Math.PI * fc * (offset + t)), '#d1a3ff');
  trace(t => Math.abs(1 + mu * message(offset + t)), '#eabf71', [6, 5]);
  trace(t => -Math.abs(1 + mu * message(offset + t)), '#eabf71', [6, 5]);
}

// Welch-style mean spectrum (Hann windows), rather than the three deltas of
// a pure tone. This reflects the broader spectrum of a recorded voice.
const fftSize = 2048;
const fftWindow = Float64Array.from({ length: fftSize }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (fftSize - 1)));
const fftCos = Float64Array.from({ length: fftSize / 2 }, (_, i) => Math.cos(-2 * Math.PI * i / fftSize));
const fftSin = Float64Array.from({ length: fftSize / 2 }, (_, i) => Math.sin(-2 * Math.PI * i / fftSize));
const fftReverse = Uint16Array.from({ length: fftSize }, (_, index) => {
  let reversed = 0;
  for (let bit = fftSize >> 1; bit; bit >>= 1) { reversed = (reversed << 1) | (index & 1); index >>= 1; }
  return reversed;
});
function meanSpectrum(samples, rate) {
  const n = fftSize, bins = n / 2 + 1, powers = new Float64Array(bins);
  const real = new Float64Array(n), imag = new Float64Array(n);
  let windows = 0;
  for (let start = 0; start + n <= samples.length; start += n / 2) {
    imag.fill(0);
    for (let i = 0; i < n; i++) real[i] = samples[start + fftReverse[i]] * fftWindow[fftReverse[i]];
    for (let size = 2; size <= n; size <<= 1) {
      const twiddleStep = n / size;
      for (let startBin = 0; startBin < n; startBin += size) {
        for (let k = 0; k < size / 2; k++) {
          const a = startBin + k, b = a + size / 2;
          const cos = fftCos[k * twiddleStep], sin = fftSin[k * twiddleStep];
          const re = real[b] * cos - imag[b] * sin, im = real[b] * sin + imag[b] * cos;
          real[b] = real[a] - re; imag[b] = imag[a] - im;
          real[a] += re; imag[a] += im;
        }
      }
    }
    for (let i = 0; i < bins; i++) powers[i] += (real[i] * real[i] + imag[i] * imag[i]) / (n * n);
    windows++;
  }
  for (let i = 0; i < bins; i++) powers[i] /= windows || 1;
  return { powers, step: rate / n };
}
function buildVoiceSpectra() {
  if (!voiceData) return;
  // Scale by the same playback gains used in the listening comparison.
  const originalGain = playbackGain(voiceData.original), recoveredGain = playbackGain(voiceData.recovered);
  voiceData.originalSpectrum ??= meanSpectrum(Float32Array.from(voiceData.original, x => x * originalGain), voiceData.rate);
  voiceData.recoveredSpectrum = meanSpectrum(Float32Array.from(voiceData.recovered, x => x * recoveredGain), voiceData.rate);
}
function drawVoiceSpectrum() {
  if (!voiceData?.originalSpectrum) return;
  const canvas = document.getElementById('voice-spectrum'), w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const L = 55, R = w - 20, top = 26, B = h - 42, maxHz = 8000;
  const x = f => L + f / maxHz * (R - L), y = db => B - (db + 80) / 80 * (B - top);
  let reference = 1e-20;
  for (const spectrum of [voiceData.originalSpectrum, voiceData.recoveredSpectrum]) {
    for (const power of spectrum.powers) reference = Math.max(reference, power);
  }
  ctx.font = '12px system-ui'; ctx.fillStyle = '#a9bbd0'; ctx.strokeStyle = '#273b53'; ctx.lineWidth = 1;
  for (const db of [-80, -40, 0]) {
    ctx.beginPath(); ctx.moveTo(L, y(db)); ctx.lineTo(R, y(db)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(db, L - 8, y(db) + 4);
  }
  for (const f of [0, 2000, 4000, 6000, 8000]) {
    ctx.beginPath(); ctx.moveTo(x(f), top); ctx.lineTo(x(f), B); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(f / 1000, x(f), B + 20);
  }
  ctx.textAlign = 'left'; ctx.fillText('Nivell relatiu (dB)', L, 14);
  ctx.textAlign = 'right'; ctx.fillText('Freqüència (kHz)', R, h - 5);
  for (const [spectrum, color] of [[voiceData.originalSpectrum, '#77baff'], [voiceData.recoveredSpectrum, '#d1a3ff']]) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < spectrum.powers.length && i * spectrum.step <= maxHz; i++) {
      const db = Math.max(-80, 10 * Math.log10(Math.max(1e-20, spectrum.powers[i]) / reference));
      if (i) ctx.lineTo(x(i * spectrum.step), y(db)); else ctx.moveTo(x(0), y(db));
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#eabf71'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(x(3000), top); ctx.lineTo(x(3000), B); ctx.stroke(); ctx.setLineDash([]);
}

document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAudio(); cancelRecording(); } });
window.addEventListener('pagehide', () => { stopAudio(); cancelRecording(); });
new ResizeObserver(() => { if (mode === 'tone') update(); else drawVoice(); }).observe(document.querySelector('main'));
update();
