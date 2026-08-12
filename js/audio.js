// audio.js — SV.Audio: WebAudio 合成音效(首次手势解锁,每类节流防糊)
(function () {
  "use strict";
  const SV = window.SV;

  let ctx = null, master = null, musicGain = null, sfxGain = null, muted = false, unlocked = false, musicVol = 1.0, sfxVol = 1.0;

  function ensure() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.32;     // 总上限 + 静音目标(0 时全静)
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicVol;            // 音乐音量(0..1,默认 1.0)
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = sfxVol;                // 音效音量(0..1,默认 1.0)
      sfxGain.connect(master);
    } catch (e) { ctx = null; }
  }
  function resume() {
    ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
    unlocked = true;
  }

  // 基础原语:一个带包络的振荡器
  function tone(freq, dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.slideTo), t0 + dur);
    if (opts.schedule) for (let i = 0; i < opts.schedule.length; i++) { const p = opts.schedule[i]; osc.frequency.setValueAtTime(p[1], t0 + p[0]); }
    const peak = opts.vol == null ? 0.25 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  // 白噪声(爆炸/命中)
  function noise(dur, opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = opts.filter || "bandpass"; filt.frequency.value = opts.freq || 800; filt.Q.value = opts.q || 0.8;
    const g = ctx.createGain(); g.gain.value = opts.vol == null ? 0.2 : opts.vol;
    src.connect(filt); filt.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // 节流:同一音效在间隔内只响一次
  const _last = {};
  function throttled(key, ms) {
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (_last[key] && now - _last[key] < ms) return false;
    _last[key] = now; return true;
  }

  // ── 程序化 BGM:lookahead 节拍调度,128 步循环,按 pf.theme 分发到巴赫体裁主题(每关独立旋律/低音/鼓组)
  let musicProfile = null, musicTimer = null, musicStep = 0, musicNextTime = 0;
  function noteFreq(root, semi) { return root * Math.pow(2, semi / 12); }
  function musicNote(freq, time, dur, vol, wave) {
    if (!ctx || !musicGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave || "triangle";
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g); g.connect(musicGain);
    osc.start(time); osc.stop(time + dur + 0.05);
  }
  // 路由到 musicGain 的噪声(用于 hat/军鼓等打击层),支持未来时刻调度
  function musicNoise(time, dur, opts) {
    if (!ctx || !musicGain) return;
    opts = opts || {};
    const n = Math.floor(ctx.sampleRate * dur);
    if (n <= 0) return;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = opts.filter || "highpass";
    filt.frequency.value = opts.freq || 6000;
    filt.Q.value = opts.q == null ? 0.7 : opts.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.vol == null ? 0.05 : opts.vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt); filt.connect(g); g.connect(musicGain);
    src.start(time); src.stop(time + dur + 0.02);
  }
  // kick:低频正弦快速下扫,经典底鼓
  function kick(time, vol) {
    if (!ctx || !musicGain) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(vol == null ? 0.30 : vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.20);
    osc.connect(g); g.connect(musicGain);
    osc.start(time); osc.stop(time + 0.24);
  }
  // ── 程序化 BGM:lookahead 节拍调度,256 步循环(~1 分钟),按 pf.theme 分发,每 theme 含 16 个独立手谱 motif
  const LOOP = 256, PHRASE = 16;
  // 音阶度 → 半音(支持越界八度折叠)
  function scaleSemi(scale, idx) {
    if (idx < 0) return scale[0];
    const len = scale.length;
    return scale[idx % len] + 12 * Math.floor(idx / len);
  }
  // ── 5 套主题:每 theme 含 16 个独立 motif(A...A' 结构 + 起承转合 + 末段 V 半终止)
  const THEMES = {
    // ruins:神秘小调,流动级进 + 呼吸休止(每 phrase 16 音,前 8 call + 后 8 response,零字面重复)
    invention: {
      motifs: [
        [0, 2, 3, -1, 2, 0, -1, -1, 3, 5, 3, 2, 0, 2, 0, -1],
        [3, 4, 5, 4, 3, 2, 0, -1, 2, 3, 5, 3, 2, 0, -1, -1],
        [0, -1, 3, -1, 5, -1, 3, -1, 4, -1, 3, -1, 2, -1, 0, -1],
        [5, -1, 4, -1, 3, -1, 2, -1, 0, 2, 3, -1, 2, 0, -1, -1],
        [2, 3, 2, 0, 2, 3, 5, -1, 3, 5, 3, 2, 3, 5, 3, -1],
        [3, 5, 3, 2, 3, 4, 5, -1, 4, 5, 4, 3, 2, 3, 0, -1],
        [3, 2, 3, 5, 3, 2, 0, -1, 2, 0, 2, 3, 5, 3, 2, -1],
        [2, 3, 4, 5, 4, 3, 2, -1, 0, 2, 3, 2, 0, -1, -1, -1],
        [0, 2, 3, 5, 3, 2, 0, -1, 3, 5, 4, 5, 3, 2, 0, -1],
        [0, 3, 2, 3, 5, 3, 2, -1, 5, 3, 2, 0, 2, 0, -1, -1],
        [3, 2, 3, 5, 3, 5, 4, -1, 5, 4, 5, 3, 5, 4, 3, -1],
        [5, 4, 5, 3, 5, 4, 3, -1, 3, 5, 4, 3, 2, 3, 0, -1],
        [3, 5, 3, 5, 4, 5, 3, -1, 4, 5, 4, 5, 3, 5, 4, -1],
        [2, 3, 5, 3, 2, 3, 0, -1, 3, 5, 4, 3, 5, 4, 3, -1],
        [5, 5, 4, 3, 5, 5, 4, -1, 5, 4, 5, 4, 3, 5, 3, -1],
        [3, 2, 0, 2, 3, -1, 3, -1, 0, 2, 3, -1, 4, -1, 3, -1]
      ],
      melodyOct: 12, melodyWave: "triangle", melodyVol: 0.10,
      bass: { style: "pedal", oct: -12, vol: 0.18 },
      bassDeg: [0,0, 2,2, 3,3, 0,0, 0,0, 2,2, 3,3, 0,3],
      drums: {
        kick:  [1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0],
        snare: [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
        hat:   [0,0,0,1,0,0,0,0, 0,0,0,1,0,0,0,0]
      },
      pad: false
    },
    // crimson:戏剧大跳 + 急促走句 + 高潮重复
    toccata: {
      motifs: [
        [0, -1, 4, 3, -1, 4, 0, -1, 4, 3, 4, 5, 4, 3, 0, -1],
        [4, 3, 4, 5, 4, 3, 0, -1, 0, 4, 3, 4, 5, 4, 0, -1],
        [0, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1, 0, 1, 2, -1],
        [4, 3, 2, 1, 0, 1, 2, -1, 1, 2, 3, 4, 5, 4, 3, -1],
        [0, -1, -1, 4, -1, -1, 0, -1, 3, 4, 3, 4, 3, 4, 3, -1],
        [3, 4, 3, 4, 3, 4, 3, -1, 0, 4, 0, 4, 3, 4, 0, -1],
        [0, 4, 0, 4, 3, 4, 0, -1, 1, 2, 3, 4, 3, 2, 1, -1],
        [4, 3, 4, 5, 4, 3, 0, -1, 0, 4, 3, 0, 4, 0, -1, -1],
        [0, -1, 4, 5, 4, 3, 0, -1, 4, 5, 4, 3, 4, 5, 4, -1],
        [0, 4, 3, 4, 5, 4, 0, -1, 5, 4, 3, 4, 5, 4, 0, -1],
        [3, 4, 5, 4, 5, 4, 3, -1, 5, 4, 5, 4, 5, 4, 3, -1],
        [5, 4, 3, 4, 5, 4, 3, -1, 4, 3, 2, 1, 0, 1, 2, -1],
        [0, 4, 0, 4, 5, 4, 0, -1, 4, 5, 4, 5, 4, 5, 4, -1],
        [4, 5, 4, 5, 4, 3, 0, -1, 3, 4, 5, 4, 3, 0, -1, -1],
        [5, 4, 5, 4, 5, 4, 3, -1, 5, 5, 4, 5, 5, 4, 3, -1],
        [0, 4, 3, -1, 4, -1, 4, -1, 0, 3, 4, -1, 4, -1, 4, -1]
      ],
      melodyOct: 12, melodyWave: "sawtooth", melodyVol: 0.10,
      bass: { style: "ostinato", oct: -12, vol: 0.17 },
      bassDeg: [0,0, 4,4, 0,0, 4,4, 3,3, 0,0, 4,4, 0,4],
      drums: {
        kick:  [1,0,0,0,1,0,1,0, 1,0,0,0,1,0,1,0],
        snare: [0,0,0,0,1,0,0,0, 0,0,0,0,1,0,1,0],
        hat:   [0,1,0,1,0,1,0,1, 0,1,0,1,0,1,0,1]
      },
      pad: false
    },
    // frozen:长音呼吸 + 装饰级进
    aria: {
      motifs: [
        [0, -1, -1, 2, -1, -1, 4, -1, 4, -1, -1, 3, -1, -1, 0, -1],
        [4, -1, -1, 3, -1, -1, 0, -1, 0, -1, 2, -1, 4, -1, 2, -1],
        [0, -1, 4, -1, 2, -1, -1, -1, 4, -1, 3, -1, 2, -1, -1, -1],
        [4, -1, 3, -1, 2, -1, -1, -1, 2, -1, 4, -1, 5, -1, 4, -1],
        [0, 2, 0, 2, 4, 2, 0, -1, 2, 4, 2, 4, 3, 4, 2, -1],
        [2, 4, 2, 4, 3, 4, 2, -1, 4, 3, 4, 5, 4, 3, 2, -1],
        [4, 3, 4, 5, 4, 3, 2, -1, 3, 4, 5, 4, 3, 2, 0, -1],
        [3, 2, 0, 2, 4, -1, -1, -1, 0, 2, 4, -1, 2, 0, -1, -1],
        [0, -1, 2, 4, 2, -1, 0, -1, 0, 2, 4, 5, 4, 2, 0, -1],
        [0, 2, 4, -1, 2, 0, -1, -1, 4, 5, 4, 3, 2, 0, -1, -1],
        [4, -1, 5, -1, 4, -1, 3, -1, 5, -1, 4, -1, 3, -1, 2, -1],
        [5, 4, 5, 4, 3, 2, 0, -1, 4, 3, 2, 0, 2, 0, -1, -1],
        [5, -1, 5, -1, 4, -1, 3, -1, 5, 4, 5, 4, 3, 4, 5, -1],
        [4, 5, 4, 5, 4, 3, 2, -1, 3, 4, 5, 4, 3, 2, 0, -1],
        [5, 5, 4, 5, 5, 4, 3, -1, 5, 4, 5, 4, 5, 4, 3, -1],
        [4, -1, 3, -1, 2, -1, 3, -1, 4, -1, 3, -1, 2, -1, 3, -1]
      ],
      melodyOct: 12, melodyWave: "sine", melodyVol: 0.10,
      bass: { style: "slowwalk", oct: -12, vol: 0.15 },
      bassDeg: [0,0, 3,3, 2,2, 0,0, 0,0, 3,3, 2,2, 0,3],
      drums: {
        kick:  [1,0,0,0,0,0,0,0, 1,0,0,0,0,0,0,0],
        snare: [0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0],
        hat:   [0,0,0,1,0,0,0,1, 0,0,0,1,0,0,0,1]
      },
      pad: true
    },
    // void:whole-tone 棱角 + 三全音跳 + 半音下行
    fugue: {
      motifs: [
        [0, -1, 3, 2, -1, 3, 0, -1, 3, 2, 3, 4, 3, 2, 0, -1],
        [3, 2, 3, 4, 3, 2, 0, -1, 0, 3, 2, 3, 4, 3, 0, -1],
        [0, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1, 0, 1, 2, -1],
        [4, 3, 2, 1, 0, 1, 2, -1, 1, 2, 3, 4, 5, 4, 3, -1],
        [0, 3, 0, 3, 4, 3, 0, -1, 3, 4, 3, 4, 3, 4, 3, -1],
        [2, 5, 2, 5, 4, 5, 2, -1, 5, 4, 5, 4, 5, 4, 2, -1],
        [5, 4, 3, 2, 1, 0, -1, -1, 1, 2, 3, 4, 3, 2, 1, -1],
        [0, 2, 4, 3, 2, 0, -1, -1, 2, 3, 4, 3, 2, 0, -1, -1],
        [0, 2, 3, 0, 4, 3, 0, -1, 3, 4, 3, 4, 5, 3, 0, -1],
        [3, 4, 3, 4, 5, 3, 0, -1, 5, 4, 3, 4, 5, 3, 0, -1],
        [3, 4, 3, 4, 3, 4, 3, -1, 4, 3, 4, 3, 4, 3, 0, -1],
        [4, 3, 4, 3, 4, 3, 0, -1, 3, 2, 1, 0, 1, 2, 3, -1],
        [0, 3, 0, 3, 4, 5, 3, -1, 4, 5, 4, 5, 4, 5, 3, -1],
        [3, 5, 4, 5, 3, 5, 3, -1, 4, 5, 4, 3, 4, 3, 0, -1],
        [5, 3, 5, 3, 5, 3, 4, -1, 5, 4, 5, 4, 3, 4, 3, -1],
        [0, 3, 0, -1, 3, -1, 3, -1, 0, 2, 3, -1, 3, -1, 3, -1]
      ],
      melodyOct: 12, melodyWave: "square", melodyVol: 0.09,
      bass: { style: "chromatic", oct: -12, vol: 0.15 },
      bassDeg: [0,0, 5,5, 4,4, 3,3, 2,2, 1,1, 0,0, 3,3],
      drums: {
        kick:  [1,0,0,1,0,0,1,0, 1,0,0,1,0,0,1,0],
        snare: [0,0,0,0,0,1,0,0, 0,0,0,0,0,1,0,0],
        hat:   [0,1,0,1,0,1,0,1, 0,1,0,1,0,1,0,1]
      },
      pad: false
    },
    // menu:跳跃活泼 + 邻音回音 + 走句对比
    badinerie: {
      motifs: [
        [0, 2, 4, 2, 1, 2, 0, -1, 4, 2, 4, 5, 4, 2, 0, -1],
        [4, 2, 4, 5, 4, 2, 0, -1, 0, 2, 4, 2, 1, 2, 0, -1],
        [4, 3, 2, 1, 0, 1, 2, -1, 1, 2, 3, 4, 5, 4, 3, -1],
        [0, 1, 2, 3, 4, 3, 2, -1, 4, 3, 2, 1, 0, 1, 2, -1],
        [2, 4, 2, 4, 3, 4, 2, -1, 4, 3, 4, 5, 4, 3, 2, -1],
        [4, 3, 4, 5, 4, 3, 2, -1, 3, 2, 0, 2, 4, 2, 0, -1],
        [0, 2, 4, 5, 4, 2, 0, -1, 2, 4, 5, 4, 3, 2, 0, -1],
        [4, 3, 2, 0, 2, 1, 0, -1, 0, 2, 4, 2, 0, -1, -1, -1],
        [0, 2, 4, 5, 2, 4, 0, -1, 4, 5, 4, 2, 4, 2, 0, -1],
        [0, 4, 2, 4, 3, 2, 0, -1, 2, 4, 5, 4, 2, 0, -1, -1],
        [4, 2, 4, 5, 4, 5, 4, -1, 5, 4, 5, 4, 5, 4, 3, -1],
        [5, 4, 5, 4, 5, 4, 3, -1, 4, 3, 2, 1, 0, 1, 2, -1],
        [4, 5, 4, 5, 4, 2, 0, -1, 2, 4, 5, 4, 5, 4, 3, -1],
        [2, 4, 5, 4, 5, 4, 3, -1, 4, 3, 2, 0, 2, 0, -1, -1],
        [5, 5, 4, 5, 5, 4, 2, -1, 5, 4, 5, 4, 5, 4, 2, -1],
        [0, 4, 2, -1, 4, -1, 3, -1, 0, 2, 4, -1, 4, -1, 3, -1]
      ],
      melodyOct: 12, melodyWave: "square", melodyVol: 0.09,
      bass: { style: "walking", oct: -12, vol: 0.15 },
      bassDeg: [0,0, 3,3, 4,4, 2,2, 0,0, 3,3, 4,4, 0,3],
      drums: {
        kick:  [1,0,0,0,1,0,0,0, 1,0,0,0,1,0,0,0],
        snare: [0,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,0],
        hat:   [0,1,0,1,0,1,0,1, 0,1,0,1,0,1,0,1]
      },
      pad: false
    }
  };
  // 行走低音每拍走的音阶度偏移(相对 bassDeg)
  const WALK = [0, 2, 4, 3, 0, 2, 4, 3];
  function scheduleStep(step, time) {
    const pf = musicProfile; if (!pf) return;
    const theme = THEMES[pf.theme] || THEMES.invention;
    const scale = pf.scale, root = pf.root, wave = pf.wave || "triangle";
    const dur8 = (60 / pf.bpm) / 2; // 八分音符时长
    const phrase = Math.floor(step / PHRASE);           // 0..15
    const local = step % PHRASE;                        // 段内 0..15
    const drumIdx = step % 16;                          // 鼓组 16 步循环(2 小节)
    const bassDeg = theme.bassDeg[phrase];
    const bassSemi = scaleSemi(scale, bassDeg);

    // ── 鼓组(16 步掩码)
    const d = theme.drums;
    if (d.kick[drumIdx]) kick(time, 0.20);
    if (d.snare[drumIdx]) musicNoise(time, 0.09, { filter: "bandpass", freq: 1700, q: 0.6, vol: 0.034 });
    if (d.hat[drumIdx]) musicNoise(time, 0.035, { filter: "highpass", freq: 7500, vol: 0.025 });

    // ── 低音:按 style 发声
    const b = theme.bass, bo = b.oct, bv = b.vol, bw = b.wave || wave;
    if (b.style === "pedal") {
      if (local === 0) musicNote(noteFreq(root, bassSemi + bo), time, dur8 * 16, bv, bw);
    } else if (b.style === "ostinato") {
      if (step % 2 === 0) musicNote(noteFreq(root, bassSemi + bo), time, dur8 * 0.9, bv, bw);
      else musicNote(noteFreq(root, bassSemi + bo + 12), time, dur8 * 0.5, bv * 0.5, bw);
    } else if (b.style === "slowwalk" || b.style === "chromatic") {
      if (step % 4 === 0) musicNote(noteFreq(root, bassSemi + bo), time, dur8 * 3.5, bv, bw);
    } else if (b.style === "walking") {
      if (step % 2 === 0) {
        const beatIdx = Math.floor(local / 2);
        const semi = scaleSemi(scale, bassDeg + WALK[beatIdx % 8]);
        musicNote(noteFreq(root, semi + bo), time, dur8 * 0.9, bv, bw);
      }
    }

    // ── 旋律:直接查表,每 phrase 16 个独立音符(前 8 call + 后 8 response,零字面重复)
    const motif = theme.motifs[phrase];
    const mi = motif[local];
    if (mi >= 0) {
      const semi = scaleSemi(scale, mi);
      musicNote(noteFreq(root, semi + theme.melodyOct), time, dur8 * 1.4, theme.melodyVol, theme.melodyWave);
    }

    // ── 可选 pad(aria 用):根音跟 bass,上声部固定,dur8*17 跨界叠加实现无缝
    if (theme.pad && local === 0) {
      musicNote(noteFreq(root, bassSemi), time, dur8 * 17, 0.05, wave);
      musicNote(noteFreq(root, scaleSemi(scale, 2)), time, dur8 * 17, 0.04, wave);
      musicNote(noteFreq(root, scaleSemi(scale, scale.length - 1)), time, dur8 * 17, 0.035, wave);
    }
  }
  function scheduler() {
    try {
      if (!ctx || !musicProfile) return;
      const ahead = 0.2;
      while (musicNextTime < ctx.currentTime + ahead) {
        scheduleStep(musicStep, musicNextTime);
        musicNextTime += (60 / musicProfile.bpm) / 2;
        musicStep = (musicStep + 1) % LOOP;
      }
    } catch (e) { /* 沙箱/异常环境忽略 */ }
  }
  function startBgm(profile) {
    ensure();
    if (!ctx) return;
    if (musicTimer && profile === musicProfile) return; // 同曲继续
    stopBgm();
    if (!profile) return;
    musicProfile = profile;
    musicStep = 0;
    musicNextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(scheduler, 25);
  }
  function stopBgm() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicProfile = null;
  }

  const Audio = {
    resume: resume,
    isUnlocked: function () { return unlocked; },
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.32; SV.Storage.setSound(!m); },
    isMuted: function () { return muted; },
    setMusicVol: function (v) { musicVol = v; if (musicGain) musicGain.gain.value = v; SV.Storage.set("musicVol", v); },
    setSfxVol: function (v) { sfxVol = v; if (sfxGain) sfxGain.gain.value = v; SV.Storage.set("sfxVol", v); },
    getMusicVol: function () { return musicVol; },
    getSfxVol: function () { return sfxVol; },
    startBgm: startBgm,
    stopBgm: stopBgm,

    shoot: function () { if (throttled("shoot", 70)) tone(680, 0.06, { type: "square", slideTo: 420, vol: 0.10 }); },
    hit: function () { if (throttled("hit", 60)) tone(220, 0.05, { type: "triangle", vol: 0.08 }); },
    die: function () { if (throttled("die", 55)) noise(0.12, { filter: "highpass", freq: 600, vol: 0.12 }); },
    pickup: function () { if (throttled("pickup", 40)) tone(880, 0.05, { type: "sine", slideTo: 1180, vol: 0.10 }); },
    hurt: function () { if (throttled("hurt", 120)) { tone(160, 0.16, { type: "sawtooth", slideTo: 80, vol: 0.22 }); noise(0.1, { freq: 400, vol: 0.1 }); } },
    levelup: function () { tone(523, 0.10, { type: "square", vol: 0.18, schedule: [[0.10, 659], [0.20, 784], [0.30, 1047]] }); },
    evolve: function () { tone(392, 0.12, { type: "sawtooth", vol: 0.2, schedule: [[0.12, 523], [0.24, 659], [0.36, 784], [0.50, 1047], [0.66, 1319]] }); },
    bossWarn: function () { tone(70, 0.5, { type: "sawtooth", vol: 0.3, schedule: [[0.0, 90], [0.25, 70]] }); noise(0.5, { filter: "lowpass", freq: 120, vol: 0.15 }); },
    lowHp: function () { if (throttled("lowHp", 2500)) tone(520, 0.3, { type: "square", vol: 0.16, schedule: [[0, 520], [0.1, 392], [0.2, 262]] }); },
    gameOver: function () { tone(330, 0.25, { type: "sawtooth", vol: 0.22, schedule: [[0.25, 262], [0.5, 196], [0.8, 130]] }); }
  };

  // 初始静音状态从存档读
  muted = !SV.Storage.get("soundOn");
  musicVol = SV.Storage.get("musicVol");   // DEFAULTS 保证非空(老存档自动迁移到新默认)
  sfxVol = SV.Storage.get("sfxVol");

  SV.Audio = Audio;
})();
