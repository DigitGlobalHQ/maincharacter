/**
 * face-metrics.js — pure facial-geometry engine (no DOM, no MediaPipe).
 * Input: `lm` = array of 468/478 landmarks as { x, y } in PIXEL coordinates
 * (the browser glue converts MediaPipe's normalised coords × image size before
 * calling in). Output: the full free-tool metric set. All functions are pure and
 * deterministic so they can be unit-tested in node.
 *
 * Landmark indices are the canonical MediaPipe FaceMesh topology.
 * Exposed as a UMD-ish global (window.FaceMetrics) AND module.exports for tests.
 */
(function (root) {
  'use strict';

  // ─── Canonical FaceMesh indices ───
  var I = {
    foreheadTop: 10, chin: 152, glabella: 168, noseTip: 1, subnasale: 2,
    mouthL: 61, mouthR: 291, lipTop: 0, lipBottom: 17,
    rEyeOuter: 33, rEyeInner: 133, rEyeTop: 159, rEyeBottom: 145,
    lEyeInner: 362, lEyeOuter: 263, lEyeTop: 386, lEyeBottom: 374,
    cheekR: 234, cheekL: 454, jawR: 172, jawL: 397,
    foreheadR: 54, foreheadL: 284, browR: 105, browL: 334,
    noseR: 49, noseL: 279,
  };

  function P(lm, i) { return lm[i] || { x: 0, y: 0 }; }
  function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function round(n, p) { var f = Math.pow(10, p || 0); return Math.round(n * f) / f; }
  // Angle (degrees) of the line a→b relative to the horizontal; +ve = b is higher
  // on screen (smaller y) toward the temporal side. Caller handles eye side.
  function lineAngle(a, b) { return Math.atan2(a.y - b.y, b.x - a.x) * 180 / Math.PI; }
  // Interior angle at vertex b formed by a-b-c, in degrees.
  function cornerAngle(a, b, c) {
    var v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    var dot = v1.x * v2.x + v1.y * v2.y;
    var m = (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1;
    return Math.acos(clamp(dot / m, -1, 1)) * 180 / Math.PI;
  }
  // Closeness of x to target on 0..100 (100 = exact); tol = value at which score≈0.
  function closeness(x, target, tol) { return round(100 * Math.max(0, 1 - Math.abs(x - target) / tol), 0); }

  function faceDims(lm) {
    var length = d(P(lm, I.foreheadTop), P(lm, I.chin));
    var cheek = d(P(lm, I.cheekR), P(lm, I.cheekL));
    var jaw = d(P(lm, I.jawR), P(lm, I.jawL));
    var forehead = d(P(lm, I.foreheadR), P(lm, I.foreheadL));
    return { length: length, cheek: cheek, jaw: jaw, forehead: forehead };
  }

  // ─── Face shape ───
  function faceShape(lm) {
    var f = faceDims(lm);
    var lw = f.length / (f.cheek || 1);          // length-to-width
    var jc = f.jaw / (f.cheek || 1);             // jaw vs cheek
    var fc = f.forehead / (f.cheek || 1);        // forehead vs cheek
    var shape, conf, rec;
    if (lw >= 1.5) { shape = 'Oblong'; conf = 78; rec = 'Add width with layered, side-swept volume; avoid extra height on top.'; }
    else if (jc > 0.92 && fc > 0.88 && lw < 1.25) { shape = 'Square'; conf = 80; rec = 'Soften the jaw with textured, rounded cuts; avoid hard, boxy fringes.'; }
    else if (fc - jc > 0.12) { shape = 'Heart'; conf = 76; rec = 'Balance a wider forehead with fuller sides and a chin-lengthening beard or contour.'; }
    else if (f.cheek > f.forehead && f.cheek > f.jaw && (f.cheek - f.jaw) / f.cheek > 0.12) { shape = 'Diamond'; conf = 74; rec = 'Build the forehead and jaw to balance prominent cheekbones; fringe adds width up top.'; }
    else if (lw < 1.18 && jc > 0.85) { shape = 'Round'; conf = 77; rec = 'Add vertical height and structured sides; sharpen the jaw with grooming and posture.'; }
    else { shape = 'Oval'; conf = 82; rec = 'The balanced ideal — most cuts work; keep the forehead and jaw in their current ratio.'; }
    return { shape: shape, confidence: conf, lengthToWidth: round(lw, 2), recommendation: rec };
  }

  // ─── Symmetry (left vs right, /100) ───
  function symmetry(lm) {
    // Facial midline as the line through forehead-top, glabella, nose tip, chin.
    var axis = [P(lm, I.foreheadTop), P(lm, I.glabella), P(lm, I.noseTip), P(lm, I.chin)];
    var mx = axis.reduce(function (s, p) { return s + p.x; }, 0) / axis.length;
    var scale = d(P(lm, I.cheekR), P(lm, I.cheekL)) || 1;
    // For a pair (right index, left index): compare |distance-from-midline|.
    function pairScore(ri, li) {
      var r = Math.abs(P(lm, ri).x - mx), l = Math.abs(P(lm, li).x - mx);
      var yr = Math.abs(P(lm, ri).y - P(lm, li).y); // vertical mismatch too
      var diff = (Math.abs(r - l) + yr) / scale;
      return clamp(100 - diff * 220, 0, 100);
    }
    var eyes = round((pairScore(I.rEyeOuter, I.lEyeOuter) + pairScore(I.rEyeInner, I.lEyeInner)) / 2, 0);
    var nose = round(pairScore(I.noseR, I.noseL), 0);
    var mouth = round(pairScore(I.mouthL, I.mouthR), 0);
    var jaw = round((pairScore(I.cheekR, I.cheekL) + pairScore(I.jawR, I.jawL)) / 2, 0);
    var overall = round((eyes + nose + mouth + jaw) / 4, 0);
    return { overall: overall, eyes: eyes, nose: nose, mouth: mouth, jaw: jaw };
  }

  // ─── Canthal tilt (degrees, +ve = upturned "hunter eyes") ───
  function canthalTilt(lm) {
    // Right eye (image-left): inner 133, outer 33. Left eye: inner 362, outer 263.
    var rIn = P(lm, I.rEyeInner), rOut = P(lm, I.rEyeOuter);
    var lIn = P(lm, I.lEyeInner), lOut = P(lm, I.lEyeOuter);
    // +ve when outer canthus sits higher (smaller y) than inner canthus.
    var rTilt = Math.atan2(rIn.y - rOut.y, Math.abs(rOut.x - rIn.x) || 1) * 180 / Math.PI;
    var lTilt = Math.atan2(lIn.y - lOut.y, Math.abs(lOut.x - lIn.x) || 1) * 180 / Math.PI;
    var deg = round((rTilt + lTilt) / 2, 1);
    var label = deg > 3 ? 'Positive (upturned)' : (deg < -1 ? 'Negative (downturned)' : 'Neutral');
    return { degrees: deg, label: label };
  }

  // ─── Eye shape ───
  function eyeShape(lm) {
    var w = d(P(lm, I.rEyeInner), P(lm, I.rEyeOuter)) || 1;
    var h = d(P(lm, I.rEyeTop), P(lm, I.rEyeBottom));
    var ratio = w / (h || 1);
    var tilt = canthalTilt(lm).degrees;
    var shape, rec;
    if (ratio < 2.4) { shape = 'Round'; rec = 'Elongate with a winged liner along the outer third.'; }
    else if (tilt > 4) { shape = 'Upturned'; rec = 'Lean into the lift — define the outer corner, keep the inner soft.'; }
    else if (tilt < -2) { shape = 'Downturned'; rec = 'Lift the outer corner with liner and a tail-up brow.'; }
    else if (ratio > 3.1) { shape = 'Long / Almond'; rec = 'The versatile ideal — balanced definition all round.'; }
    else { shape = 'Almond'; rec = 'The balanced ideal — most styling works.'; }
    return { shape: shape, aspectRatio: round(ratio, 2), recommendation: rec };
  }

  // ─── Jawline (gonial angle, taper, symmetry → score) ───
  function jawline(lm) {
    // Gonial angle at the jaw corner: ramus (cheek→gonion) vs body (gonion→chin).
    var gR = cornerAngle(P(lm, I.cheekR), P(lm, I.jawR), P(lm, I.chin));
    var gL = cornerAngle(P(lm, I.cheekL), P(lm, I.jawL), P(lm, I.chin));
    var gonial = round((gR + gL) / 2, 0);
    var f = faceDims(lm);
    var taper = round(f.jaw / (f.cheek || 1), 2); // lower = more V-taper
    var sym = symmetry(lm).jaw;
    // Score: a defined jaw favours a gonial angle near ~125°, a moderate taper, high symmetry.
    var angleScore = closeness(gonial, 125, 40);
    var taperScore = clamp(100 - Math.abs(taper - 0.82) * 260, 0, 100);
    var score = round(angleScore * 0.4 + taperScore * 0.3 + sym * 0.3, 0);
    return { gonialAngle: gonial, taper: taper, symmetry: sym, score: score };
  }

  // ─── Golden ratio ───
  function goldenRatio(lm) {
    var PHI = 1.618;
    var f = faceDims(lm);
    var lipW = d(P(lm, I.mouthL), P(lm, I.mouthR));
    var noseW = d(P(lm, I.noseR), P(lm, I.noseL)) || 1;
    var ratios = [
      { name: 'Face length : width', value: round(f.length / (f.cheek || 1), 2) },
      { name: 'Mouth : nose width', value: round(lipW / noseW, 2) },
      { name: 'Cheek : jaw width', value: round(f.cheek / (f.jaw || 1), 2) },
    ];
    var avg = ratios.reduce(function (s, r) { return s + closeness(r.value, PHI, 0.9); }, 0) / ratios.length;
    return { score: round(avg, 0), phi: PHI, ratios: ratios };
  }

  // ─── Facial ratios (FWHR, midface, thirds) ───
  function facialRatios(lm) {
    var f = faceDims(lm);
    var browMid = mid(P(lm, I.browR), P(lm, I.browL));
    var fwhr = round(f.cheek / (d(browMid, P(lm, I.lipTop)) || 1), 2);
    var midface = round(d(P(lm, I.glabella), P(lm, I.subnasale)) / (f.cheek || 1), 2);
    // Vertical thirds: brow→subnasale vs subnasale→chin balance.
    var upper = d(P(lm, I.glabella), P(lm, I.subnasale));
    var lower = d(P(lm, I.subnasale), P(lm, I.chin));
    var thirds = round(lower / (upper || 1), 2);
    return [
      { name: 'FWHR (width-to-height)', value: fwhr, ideal: '1.9' },
      { name: 'Midface ratio', value: midface, ideal: '1.0' },
      { name: 'Lower-to-upper thirds', value: thirds, ideal: '1.0' },
      { name: 'Canthal tilt °', value: canthalTilt(lm).degrees, ideal: '+5' },
    ];
  }

  // ─── Attractiveness composite (0-100, heuristic) ───
  function attractiveness(lm) {
    var sym = symmetry(lm).overall;
    var golden = goldenRatio(lm).score;
    var jaw = jawline(lm).score;
    var tilt = canthalTilt(lm).degrees;
    var tiltScore = closeness(tilt, 5, 12);
    var score = round(sym * 0.30 + golden * 0.25 + jaw * 0.25 + tiltScore * 0.20, 0);
    return { score: clamp(score, 1, 99) };
  }

  function computeAllMetrics(lm) {
    if (!Array.isArray(lm) || lm.length < 400) return null;
    return {
      faceShape: faceShape(lm),
      symmetry: symmetry(lm),
      canthalTilt: canthalTilt(lm),
      eyeShape: eyeShape(lm),
      jawline: jawline(lm),
      goldenRatio: goldenRatio(lm),
      facialRatios: facialRatios(lm),
      attractiveness: attractiveness(lm),
    };
  }

  var api = {
    computeAllMetrics: computeAllMetrics,
    faceShape: faceShape, symmetry: symmetry, canthalTilt: canthalTilt,
    eyeShape: eyeShape, jawline: jawline, goldenRatio: goldenRatio,
    facialRatios: facialRatios, attractiveness: attractiveness,
    INDICES: I, _helpers: { d: d, cornerAngle: cornerAngle, closeness: closeness },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FaceMetrics = api;
})(typeof window !== 'undefined' ? window : null);
