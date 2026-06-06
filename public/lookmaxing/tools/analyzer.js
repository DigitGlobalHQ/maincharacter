/**
 * analyzer.js — shared UI + MediaPipe glue for every free face tool.
 * Reads window.TOOL_CONFIG = { focus, eyebrow, h1, sub } and renders the whole
 * interactive analyzer into #app. `focus` decides which metric is the hero; all
 * metrics are always shown. Pure geometry lives in face-metrics.js. Runs 100%
 * client-side — the photo never leaves the device.
 */
(function () {
  'use strict';
  var CFG = window.TOOL_CONFIG || { focus: 'all', eyebrow: 'Free · Browser-Based', h1: 'Your face, measured.', sub: 'One photo. Nine readings from 478 facial landmarks.' };
  var app = document.getElementById('app');
  if (!app) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  app.innerHTML = [
    '<p class="eyebrow">' + esc(CFG.eyebrow) + '</p>',
    '<h1>' + esc(CFG.h1) + '</h1>',
    '<p class="sub">' + esc(CFG.sub) + '</p>',
    '<div class="privacy">◆ <span><b>Private by design.</b> Analysed entirely in your browser — your photo never leaves your device.</span></div>',
    '<div class="drop" id="drop"><label class="btn" for="file">Upload a photo →</label>',
    '<input type="file" id="file" accept="image/*"><p>Front-facing, even light, hair off the face. Nothing is uploaded.</p></div>',
    '<div class="stage" id="stage-analyze"><div class="canvas-wrap"><canvas id="canvas"></canvas></div>',
    '<div style="text-align:center;margin-top:18px;"><button class="btn" id="analyzeBtn">Analyse my face →</button>',
    '<button class="btn btn--ghost" id="resetBtn" style="margin-left:8px;">Choose another</button></div>',
    '<div class="loading" id="loading" style="display:none;">Mapping 478 landmarks…</div>',
    '<div class="err" id="err" style="display:none;"></div></div>',
    '<div class="stage" id="stage-results">',
    '<div class="hero-score"><div class="hero-score__num" id="heroNum">—</div>',
    '<div class="hero-score__label" id="heroLabel"></div><div class="hero-score__sub" id="heroSub"></div></div>',
    '<div class="canvas-wrap" style="max-width:380px;"><canvas id="canvas2"></canvas></div>',
    '<div class="grid" id="cards"></div>',
    '<div class="actions"><button class="btn" id="shareBtn">Share my score card →</button>',
    '<button class="btn btn--ghost" id="againBtn">Analyse another photo</button></div>',
    '<div class="cta"><p class="eyebrow" style="text-align:center;">The Full Picture</p>',
    '<h2>This is the surface. The Blueprint is the plan.</h2>',
    '<p>These free readings measure your geometry. The Bespoke Aesthetic Blueprint reads your photo across 24 metrics and hands you the 90-day protocol to move them — skin, jaw, eyes, hair, carriage, colour. ₹99/month.</p>',
    '<a class="btn" href="/lookmaxing">Get your Bespoke Blueprint →</a></div>',
    '<p class="disclaimer">A geometric, browser-based estimate for grooming and styling guidance — not a medical or clinical assessment. Lighting, angle and expression affect the read.</p>',
    '</div>',
  ].join('');

  var $ = function (id) { return document.getElementById(id); };
  var fileInput = $('file'), drop = $('drop'), stageA = $('stage-analyze'), stageR = $('stage-results');
  var canvas = $('canvas'), ctx = canvas.getContext('2d');
  var canvas2 = $('canvas2'), ctx2 = canvas2.getContext('2d');
  var img = null, landmarker = null, lastMetrics = null;

  function showErr(m) { $('err').textContent = m; $('err').style.display = 'block'; $('loading').style.display = 'none'; }

  function loadImage(file) {
    var url = URL.createObjectURL(file);
    var image = new Image();
    image.onload = function () {
      img = image;
      var maxW = 900, scale = Math.min(1, maxW / image.naturalWidth);
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      drop.style.display = 'none'; stageA.classList.add('show'); stageR.classList.remove('show');
      $('err').style.display = 'none'; URL.revokeObjectURL(url);
    };
    image.onerror = function () { showErr('Could not read that image. Try a JPG or PNG.'); };
    image.src = url;
  }

  fileInput.addEventListener('change', function (e) { if (e.target.files[0]) loadImage(e.target.files[0]); });
  $('resetBtn').addEventListener('click', function () { drop.style.display = 'block'; stageA.classList.remove('show'); fileInput.value = ''; });
  $('againBtn').addEventListener('click', function () { drop.style.display = 'block'; stageA.classList.remove('show'); stageR.classList.remove('show'); fileInput.value = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); });

  async function getLandmarker() {
    if (landmarker) return landmarker;
    var V = '0.10.18';
    var mod = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V);
    var fileset = await mod.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V + '/wasm');
    landmarker = await mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
      runningMode: 'IMAGE', numFaces: 1,
    });
    return landmarker;
  }

  $('analyzeBtn').addEventListener('click', async function () {
    if (!img) return;
    $('err').style.display = 'none'; $('loading').style.display = 'block';
    try {
      var lmk = await getLandmarker();
      var res = lmk.detect(img);
      if (!res.faceLandmarks || !res.faceLandmarks.length) { showErr('No face detected. Use a clear, front-facing photo with good light.'); return; }
      var W = canvas.width, H = canvas.height;
      var px = res.faceLandmarks[0].map(function (p) { return { x: p.x * W, y: p.y * H }; });
      var metrics = window.FaceMetrics.computeAllMetrics(px);
      if (!metrics) { showErr('Could not read enough detail. Try a sharper photo.'); return; }
      lastMetrics = metrics; drawOverlay(px); renderResults(metrics);
      $('loading').style.display = 'none';
      stageA.classList.remove('show'); stageR.classList.add('show');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (window.mc) window.mc.track('free_tool_analyzed', { focus: CFG.focus });
    } catch (e) { showErr('The analyser could not load. Check your connection and try again.'); }
  });

  function drawOverlay(px) {
    canvas2.width = canvas.width; canvas2.height = canvas.height;
    ctx2.drawImage(img, 0, 0, canvas2.width, canvas2.height);
    ctx2.fillStyle = 'rgba(232,184,75,0.55)';
    px.forEach(function (p) { ctx2.beginPath(); ctx2.arc(p.x, p.y, 1.1, 0, 6.283); ctx2.fill(); });
    var I = window.FaceMetrics.INDICES;
    ctx2.strokeStyle = 'rgba(232,184,75,0.85)'; ctx2.lineWidth = 1.4;
    function line(a, b) { ctx2.beginPath(); ctx2.moveTo(px[a].x, px[a].y); ctx2.lineTo(px[b].x, px[b].y); ctx2.stroke(); }
    line(I.cheekR, I.jawR); line(I.jawR, I.chin); line(I.chin, I.jawL); line(I.jawL, I.cheekL);
    line(I.rEyeOuter, I.rEyeInner); line(I.lEyeInner, I.lEyeOuter); line(I.foreheadTop, I.chin);
  }

  function heroFor(focus, m) {
    switch (focus) {
      case 'faceShape':   return { num: m.faceShape.shape, label: 'Face Shape · ' + m.faceShape.confidence + '% confidence', sub: m.faceShape.recommendation };
      case 'jawline':     return { num: m.jawline.score, label: 'Jawline Score · out of 100', sub: 'Gonial angle ' + m.jawline.gonialAngle + '° · taper ' + m.jawline.taper + ' · symmetry ' + m.jawline.symmetry };
      case 'symmetry':    return { num: m.symmetry.overall, label: 'Facial Symmetry · out of 100', sub: 'Eyes ' + m.symmetry.eyes + ' · Nose ' + m.symmetry.nose + ' · Mouth ' + m.symmetry.mouth + ' · Jaw ' + m.symmetry.jaw };
      case 'canthalTilt': return { num: m.canthalTilt.degrees + '°', label: 'Canthal Tilt', sub: m.canthalTilt.label + ' — the eye-corner angle behind "hunter eyes".' };
      case 'eyeShape':    return { num: m.eyeShape.shape, label: 'Eye Shape', sub: m.eyeShape.recommendation };
      case 'goldenRatio': return { num: m.goldenRatio.score, label: 'Golden Ratio · out of 100', sub: 'Proximity to the 1.618 ideal across your key facial proportions.' };
      case 'facialRatios':return { num: (m.facialRatios[0] && m.facialRatios[0].value) || '—', label: 'FWHR · width-to-height', sub: 'Plus midface, thirds and canthal tilt — see the full set below.' };
      default:            return { num: m.attractiveness.score, label: 'Attractiveness Score · out of 100', sub: 'A composite of symmetry, golden-ratio proportions, jawline and canthal tilt.' };
    }
  }

  function card(k, v, sub, pct) {
    var bar = (typeof pct === 'number') ? '<div class="bar"><i style="width:' + Math.max(0, Math.min(100, pct)) + '%"></i></div>' : '';
    return '<div class="card"><p class="card__k">' + k + '</p><p class="card__v">' + v + '</p>' + (sub ? '<p class="card__sub">' + sub + '</p>' : '') + bar + '</div>';
  }

  function renderResults(m) {
    var h = heroFor(CFG.focus, m);
    $('heroNum').textContent = h.num; $('heroLabel').textContent = h.label; $('heroSub').textContent = h.sub;
    var fr = m.facialRatios.map(function (r) { return '<div><span>' + r.name + '</span><b>' + r.value + (r.ideal ? ' · ideal ' + r.ideal : '') + '</b></div>'; }).join('');
    var sy = m.symmetry;
    $('cards').innerHTML = [
      card('Face Shape', m.faceShape.shape, m.faceShape.recommendation, m.faceShape.confidence),
      card('Attractiveness', m.attractiveness.score + ' / 100', 'Composite of symmetry, ratios, jawline & tilt.', m.attractiveness.score),
      card('Jawline Score', m.jawline.score + ' / 100', 'Gonial angle ' + m.jawline.gonialAngle + '° · taper ' + m.jawline.taper, m.jawline.score),
      card('Symmetry', sy.overall + ' / 100', 'Eyes ' + sy.eyes + ' · Nose ' + sy.nose + ' · Mouth ' + sy.mouth + ' · Jaw ' + sy.jaw, sy.overall),
      card('Canthal Tilt', m.canthalTilt.degrees + '°', m.canthalTilt.label),
      card('Eye Shape', m.eyeShape.shape, m.eyeShape.recommendation),
      card('Golden Ratio', m.goldenRatio.score + ' / 100', 'Proximity to 1.618.', m.goldenRatio.score),
      '<div class="card"><p class="card__k">Facial Ratios</p><div class="rows">' + fr + '</div></div>',
    ].join('');
  }

  $('shareBtn').addEventListener('click', function () {
    if (!lastMetrics) return;
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var g = c.getContext('2d'); g.fillStyle = '#070708'; g.fillRect(0, 0, 1200, 630);
    g.textAlign = 'center';
    var h = heroFor(CFG.focus, lastMetrics);
    g.fillStyle = '#9a8f73'; g.font = '26px Georgia'; g.fillText('F A C I A L   A N A L Y S I S', 600, 92);
    g.fillStyle = '#e8b84b'; g.font = 'italic 180px Georgia'; g.fillText(String(h.num), 600, 320);
    g.fillStyle = '#9a8f73'; g.font = '24px Georgia'; g.fillText(String(h.label).toUpperCase(), 600, 372);
    g.fillStyle = '#f4f1ea'; g.font = 'italic 38px Georgia';
    g.fillText(lastMetrics.faceShape.shape + ' · Symmetry ' + lastMetrics.symmetry.overall + ' · Jaw ' + lastMetrics.jawline.score, 600, 462);
    g.fillStyle = '#e8b84b'; g.font = '26px Georgia'; g.fillText('◆ MAINCHARACTER', 600, 560);
    g.fillStyle = '#6b6660'; g.font = '18px Georgia'; g.fillText('maincharacter.digitglobalservices.com', 600, 596);
    c.toBlob(function (blob) {
      var file = new File([blob], 'maincharacter-score.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: 'My facial analysis score. Read yours free.' }).catch(function () {});
        return;
      }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'maincharacter-score.png'; a.click();
    }, 'image/png');
  });
})();
