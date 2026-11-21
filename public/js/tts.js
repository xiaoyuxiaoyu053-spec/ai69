// Linely web — AI speech (text-to-speech) with adjustable tone. Uses the browser's built-in voices,
// so it needs no API key and works for calls, "read aloud" and auto-read.
import { h } from './lib.js';
import { touch, toast } from './state.js';
import { modal, chips, switchEl } from './core.js';

/** set by the call screen so chat auto-read doesn't talk over a call */
export const callState = { active: false };
const synth = window.speechSynthesis || null;
let voices = [];
const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
if (synth) { loadVoices(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices); }
export const ttsSupported = () => !!synth;

/** Tone presets = a (rate, pitch) pair. Sliders can still fine-tune afterwards. */
export const PRESETS = {
  default: { name: '默认', rate: 1, pitch: 1 }, gentle: { name: '温柔', rate: 0.92, pitch: 1.15 }, lively: { name: '活泼', rate: 1.12, pitch: 1.3 },
  calm: { name: '沉稳', rate: 0.95, pitch: 0.8 }, sweet: { name: '甜美', rate: 1.02, pitch: 1.5 }, teen: { name: '少年', rate: 1.08, pitch: 0.95 },
  slow: { name: '慢读', rate: 0.75, pitch: 1 }, news: { name: '播音', rate: 1.05, pitch: 1.02 },
};
export const voiceOf = (p) => ({ uri: '', preset: 'default', rate: 1, pitch: 1, volume: 1, auto: false, ...((p && p.voice) || {}) });

export function listVoices(lang = 'zh-CN') {
  const pref = lang.slice(0, 2).toLowerCase();
  return [...voices.filter((v) => v.lang.toLowerCase().startsWith(pref)), ...voices.filter((v) => !v.lang.toLowerCase().startsWith(pref))];
}
function pickVoice(cfg, lang) {
  if (cfg.uri) { const x = voices.find((v) => v.voiceURI === cfg.uri); if (x) return x; }
  const l = lang.toLowerCase().replace('_', '-');
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-') === l) || voices.find((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2))) || null;
}
/** Strip markers, markdown, links and emoji so the voice doesn't read them out. */
export function cleanForSpeech(t) {
  return String(t || '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\[(?:红包|转账)\|[^\]]*\]/g, '').replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]+/g, '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
}
function chunks(text) {
  const parts = text.split(/(?<=[。！？!?；;…\n])/).map((s) => s.trim()).filter(Boolean), out = [];
  for (const s of parts) { if (out.length && out[out.length - 1].length + s.length <= 70) out[out.length - 1] += s; else out.push(s); }
  return out.flatMap((s) => (s.length <= 160 ? [s] : s.match(/.{1,120}/gs)));
}

let ticket = 0;
export const stopSpeaking = () => { ticket++; if (synth) synth.cancel(); };
export const isSpeaking = () => !!synth && (synth.speaking || synth.pending);
/** iOS / Safari only allow speech after a tap — call this inside a click handler once. */
export function unlockTTS() { try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch { /* ignore */ } }

/** Speaks `text` sentence by sentence (long utterances get cut off by Chrome otherwise). Resolves when finished or stopped. */
export async function speak(text, cfg = voiceOf(null), { lang = 'zh-CN', onStart, onSentence } = {}) {
  if (!synth) return;
  const body = cleanForSpeech(text); if (!body) return;
  const my = ++ticket; synth.cancel();
  await new Promise((r) => setTimeout(r, 40));
  const voice = pickVoice(cfg, lang); let started = false;
  for (const c of chunks(body)) {
    if (my !== ticket) return;
    if (onSentence) onSentence(c);
    await new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = voice ? voice.lang : lang; if (voice) { try { u.voice = voice; } catch { /* unsupported voice object */ } }
      u.rate = Math.max(0.5, Math.min(2, cfg.rate || 1)); u.pitch = Math.max(0, Math.min(2, cfg.pitch == null ? 1 : cfg.pitch)); u.volume = Math.max(0, Math.min(1, cfg.volume == null ? 1 : cfg.volume));
      const done = () => { clearTimeout(guard); resolve(); };
      const guard = setTimeout(done, 8000 + c.length * 450);
      u.onstart = () => { if (!started) { started = true; if (onStart) onStart(); } };
      u.onend = done; u.onerror = done;
      synth.speak(u);
    });
  }
}

/** Voice + tone settings for one character. */
export function openVoiceSettings(p, { lang = 'zh-CN', onChange } = {}) {
  const v = voiceOf(p); p.voice = v;
  const save = () => { p.voice = v; touch(); if (onChange) onChange(v); };
  const slider = (min, max, step, key, fmt) => {
    const lab = h('b', { class: 'val' }, fmt(v[key])), inp = h('input', { type: 'range', class: 'slider', min, max, step, value: v[key], 'aria-label': key });
    inp.addEventListener('input', () => { v[key] = Number(inp.value); v.preset = matchPreset(); lab.textContent = fmt(v[key]); drawPresets(); save(); });
    return { lab, inp };
  };
  const matchPreset = () => Object.entries(PRESETS).find(([, x]) => Math.abs(x.rate - v.rate) < 0.01 && Math.abs(x.pitch - v.pitch) < 0.01)?.[0] || 'custom';
  const rate = slider(0.5, 2, 0.05, 'rate', (x) => x.toFixed(2) + '×'), pitch = slider(0, 2, 0.05, 'pitch', (x) => x.toFixed(2)), vol = slider(0.1, 1, 0.05, 'volume', (x) => Math.round(x * 100) + '%');
  const presetBox = h('div');
  function drawPresets() {
    presetBox.replaceChildren(h('div', { class: 'chips' }, ...Object.entries(PRESETS).map(([k, x]) => h('button', { class: 'ch bounce' + (v.preset === k ? ' on' : ''), onClick: () => {
      v.preset = k; v.rate = x.rate; v.pitch = x.pitch; rate.inp.value = x.rate; pitch.inp.value = x.pitch; rate.lab.textContent = x.rate.toFixed(2) + '×'; pitch.lab.textContent = x.pitch.toFixed(2); drawPresets(); save(); sample();
    } }, x.name))));
  }
  const sel = h('select', { 'aria-label': '选择声音' });
  const fillVoices = () => { const list = listVoices(lang); sel.replaceChildren(h('option', { value: '' }, '自动（推荐）'), ...list.map((x) => h('option', { value: x.voiceURI }, `${x.name} · ${x.lang}`))); sel.value = v.uri || ''; };
  fillVoices(); setTimeout(fillVoices, 600);
  sel.addEventListener('change', () => { v.uri = sel.value; save(); sample(); });
  const sample = () => { stopSpeaking(); speak(`你好呀，我是${p.name || 'AI'}。今天也想多听听你说话。`, v, { lang }); };
  const noZh = ttsSupported() && !listVoices(lang).some((x) => x.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
  drawPresets();
  const dlg = modal({
    title: `${p.name || 'AI'} 的声音`,
    body: !ttsSupported() ? [h('p', null, '当前浏览器不支持语音合成，建议使用 Chrome / Edge / Safari。')] : [
      noZh ? h('div', { class: 'hint', style: 'margin:0 0 8px' }, '没有找到该语言的语音。可在系统设置里安装中文语音包，iPhone：设置 › 辅助功能 › 朗读内容 › 声音。') : null,
      h('label', { class: 'fld' }, h('span', null, '声音'), sel),
      h('b', { class: 'lbl' }, '语气'), presetBox,
      h('b', { class: 'lbl' }, '语速'), h('div', { class: 'srow' }, rate.inp, rate.lab),
      h('b', { class: 'lbl' }, '音调'), h('div', { class: 'srow' }, pitch.inp, pitch.lab),
      h('b', { class: 'lbl' }, '音量'), h('div', { class: 'srow' }, vol.inp, vol.lab),
      h('div', { class: 'setting' }, h('div', { class: 't' }, h('b', null, 'AI 新消息自动朗读'), h('small', null, '聊天时收到回复就读出来')), switchEl(!!v.auto, (x) => { v.auto = x; save(); })),
      h('button', { class: 'btn bounce soft', onClick: sample }, '试听一下')],
    actions: [{ label: '完成', kind: 'p', onClick: () => { stopSpeaking(); } }], onClose: () => stopSpeaking(),
  });
  void toast; return dlg;
}
