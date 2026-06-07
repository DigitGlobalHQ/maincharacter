/**
 * face-embed.js — embeds the free-tool facial analysis (478-landmark mesh overlay
 * + geometric KPI cards) into the funnel report. Reuses window.FaceMetrics (the same
 * geometry engine the /face tool uses) and MediaPipe FaceLandmarker, entirely in the
 * browser — the photo never leaves the device.
 *
 * Usage:  FaceEmbed.run({ photo: <dataURL>, root: <HTMLElement> })
 * Renders nothing (hides root) if there is no photo, no face, or the model can't load,
 * so it can never break the report around it.
 */
(function () {
  'use strict';

  var CSS = [
    '.mcfe{margin:0 auto;max-width:var(--mc-content-max,720px)}',
    '.mcfe__hero{text-align:center;margin-bottom:var(--mc-sp-4,18px)}',
    '.mcfe__num{font-family:var(--mc-font-serif,"Cormorant Garamond",serif);font-style:italic;font-size:clamp(56px,12vw,84px);line-height:1;color:var(--mc-silver-bright,#e8e8e8)}',
    '.mcfe__label{font-family:var(--mc-font-mono,"JetBrains Mono",monospace);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mc-silver-faint,#5a5a5a);margin-top:8px}',
    '.mcfe__sub{font-size:var(--mc-fs-small,13px);color:var(--mc-silver-mid,#c0c0c0);max-width:46ch;margin:10px auto 0;line-height:1.5}',
    '.mcfe__canvas-wrap{display:flex;justify-content:center;margin:var(--mc-sp-5,24px) 0}',
    '.mcfe__canvas{max-width:300px;width:100%;height:auto;border-radius:var(--mc-r-3,14px);border:1px solid var(--mc-line,rgba(255,255,255,.10))}',
    '.mcfe__grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--mc-sp-3,12px)}',
    '.mcfe__card{border:1px solid var(--mc-line,rgba(255,255,255,.10));border-radius:var(--mc-r-3,14px);background:var(--mc-near-black,#0c0c0e);padding:var(--mc-sp-4,18px)}',
    '.mcfe__k{font-family:var(--mc-font-mono,monospace);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--mc-silver-faint,#5a5a5a);margin:0 0 8px}',
    '.mcfe__v{font-family:var(--mc-font-serif,serif);font-style:italic;font-size:24px;color:var(--mc-silver-bright,#e8e8e8);margin:0}',
    '.mcfe__cs{font-size:12.5px;color:var(--mc-silver-dim,#8a8a8a);margin:8px 0 0;line-height:1.4}',
    '.mcfe__bar{height:3px;border-radius:3px;background:var(--mc-line,rgba(255,255,255,.10));margin-top:12px;overflow:hidden}',
    '.mcfe__bar i{display:block;height:100%;background:var(--mc-silver-mid,#c0c0c0)}',
    '.mcfe__rows div{display:flex;justify-content:space-between;font-size:12.5px;color:var(--mc-silver-dim,#8a8a8a);padding:3px 0}',
    '.mcfe__rows b{color:var(--mc-silver-bright,#e8e8e8);font-weight:500}',
    '.mcfe__loading{text-align:center;font-family:var(--mc-font-mono,monospace);font-size:12px;letter-spacing:.1em;color:var(--mc-silver-faint,#5a5a5a);padding:var(--mc-sp-6,32px) 0}',
    '@media (max-width:520px){.mcfe__grid{grid-template-columns:1fr}}',
  ].join('');

  function injectStyle() {
    if (document.getElementById('mcfe-style')) return;
    var s = document.createElement('style'); s.id = 'mcfe-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var _landmarker = null;
  async function getLandmarker() {
    if (_landmarker) return _landmarker;
    var V = '0.10.18';
    var mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V);
    var fileset = await mod.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V + '/wasm');
    _landmarker = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
      runningMode: 'IMAGE', numFaces: 1,
    });
    return _landmarker;
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function card(k, v, sub, pct) {
    var bar = (typeof pct === 'number') ? '<div class="mcfe__bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' : '';
    return '<div class="mcfe__card"><p class="mcfe__k">' + esc(k) + '</p><p class="mcfe__v">' + esc(v) + '</p>' +
      (sub ? '<p class="mcfe__cs">' + esc(sub) + '</p>' : '') + bar + '</div>';
  }

  function drawOverlay(ctx, px, W, H) {
    var I = window.FaceMetrics.INDICES;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    px.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, 6.283); ctx.fill(); });
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4;
    function line(a, b) { ctx.beginPath(); ctx.moveTo(px[a].x, px[a].y); ctx.lineTo(px[b].x, px[b].y); ctx.stroke(); }
    line(I.cheekR, I.jawR); line(I.jawR, I.chin); line(I.chin, I.jawL); line(I.jawL, I.cheekL);
    line(I.rEyeOuter, I.rEyeInner); line(I.lEyeInner, I.lEyeOuter); line(I.foreheadTop, I.chin);
  }

  function renderCards(m) {
    var sy = m.symmetry;
    var fr = (m.facialRatios || []).map(function (r) {
      return '<div><span>' + esc(r.name) + '</span><b>' + esc(r.value) + (r.ideal ? ' · ideal ' + esc(r.ideal) : '') + '</b></div>';
    }).join('');
    return [
      card('Face Shape', m.faceShape.shape, m.faceShape.recommendation, m.faceShape.confidence),
      card('Attractiveness', m.attractiveness.score + ' / 100', 'Composite of symmetry, ratios, jawline & tilt.', m.attractiveness.score),
      card('Jawline Score', m.jawline.score + ' / 100', 'Gonial angle ' + m.jawline.gonialAngle + '° · taper ' + m.jawline.taper, m.jawline.score),
      card('Symmetry', sy.overall + ' / 100', 'Eyes ' + sy.eyes + ' · Nose ' + sy.nose + ' · Mouth ' + sy.mouth + ' · Jaw ' + sy.jaw, sy.overall),
      card('Canthal Tilt', m.canthalTilt.degrees + '°', m.canthalTilt.label),
      card('Eye Shape', m.eyeShape.shape, m.eyeShape.recommendation),
      card('Golden Ratio', m.goldenRatio.score + ' / 100', 'Proximity to 1.618.', m.goldenRatio.score),
      '<div class="mcfe__card"><p class="mcfe__k">Facial Ratios</p><div class="mcfe__rows">' + fr + '</div></div>',
    ].join('');
  }

  function buildSection(root, m, withCanvas) {
    root.classList.add('mcfe');
    root.innerHTML =
      '<div class="mcfe__hero">' +
        '<div class="mcfe__num">' + esc(m.attractiveness.score) + '</div>' +
        '<div class="mcfe__label">Attractiveness Score · out of 100</div>' +
        '<p class="mcfe__sub">A composite of symmetry, golden-ratio proportions, jawline and canthal tilt — read from your photograph across 478 facial landmarks.</p>' +
      '</div>' +
      (withCanvas ? '<div class="mcfe__canvas-wrap"><canvas class="mcfe__canvas"></canvas></div>' : '') +
      '<div class="mcfe__grid">' + renderCards(m) + '</div>';
  }

  // Best-effort: draw the photo + 478-landmark mesh on the section's canvas. Never
  // throws; hides the canvas if a face can't be detected. The KPI cards stand alone.
  function drawMeshOnto(root, photo) {
    var wrap = root.querySelector('.mcfe__canvas-wrap');
    var canvas = root.querySelector('.mcfe__canvas');
    if (!canvas) return;
    var image = new Image();
    image.onerror = function () { if (wrap) wrap.style.display = 'none'; };
    image.onload = async function () {
      try {
        var maxW = 720, scale = Math.min(1, maxW / image.naturalWidth);
        var W = Math.round(image.naturalWidth * scale), H = Math.round(image.naturalHeight * scale);
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, W, H);
        if (window.FaceMetrics) {
          var lmk = await getLandmarker();
          var res = lmk.detect(image);
          if (res.faceLandmarks && res.faceLandmarks.length) {
            var px = res.faceLandmarks[0].map(function (p) { return { x: p.x * W, y: p.y * H }; });
            drawOverlay(ctx, px, W, H);
          }
        }
      } catch (e) { if (wrap) wrap.style.display = 'none'; }
    };
    image.src = photo;
  }

  /**
   * run({ root, metrics?, photo?, onDone? })
   *  - metrics (Gemini faceMeasured, same shape as FaceMetrics.computeAllMetrics):
   *    when present, the KPI cards + score come from Gemini; the mesh is best-effort.
   *  - else: compute the metrics in-browser from the photo (the free-tool engine).
   */
  async function run(opts) {
    opts = opts || {};
    var root = opts.root;
    function done(ok) { if (typeof opts.onDone === 'function') opts.onDone(!!ok); }
    function fail() { if (root) root.style.display = 'none'; done(false); }
    if (!root) { done(false); return; }
    injectStyle();

    // Preferred path: Gemini already produced the metrics.
    if (opts.metrics && opts.metrics.attractiveness) {
      buildSection(root, opts.metrics, !!opts.photo);
      done(true);
      if (opts.photo) drawMeshOnto(root, opts.photo);
      if (window.mc) window.mc.track('report_face_shown', { source: 'gemini' });
      return;
    }

    // Fallback path: compute in-browser from the photo.
    if (!opts.photo || !window.FaceMetrics) { fail(); return; }
    root.classList.add('mcfe');
    root.innerHTML = '<div class="mcfe__loading">Mapping 478 facial landmarks…</div>';
    var image = new Image();
    image.onerror = function () { fail(); };
    image.onload = async function () {
      try {
        var maxW = 720, scale = Math.min(1, maxW / image.naturalWidth);
        var W = Math.round(image.naturalWidth * scale), H = Math.round(image.naturalHeight * scale);
        var lmk = await getLandmarker();
        var res = lmk.detect(image);
        if (!res.faceLandmarks || !res.faceLandmarks.length) { fail(); return; }
        var px = res.faceLandmarks[0].map(function (p) { return { x: p.x * W, y: p.y * H }; });
        var m = window.FaceMetrics.computeAllMetrics(px);
        if (!m) { fail(); return; }
        buildSection(root, m, true);
        var canvas = root.querySelector('.mcfe__canvas');
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0, W, H); drawOverlay(ctx, px, W, H);
        done(true);
        if (window.mc) window.mc.track('report_face_shown', { source: 'math' });
      } catch (e) { fail(); }
    };
    image.src = opts.photo;
  }

  window.FaceEmbed = { run: run };
})();
