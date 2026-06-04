import * as THREE from 'three';

/**
 * Procedurally generated canvas textures — zero external asset files.
 * Each generator paints a 512² canvas; canvasTexture() wraps it for tiling.
 */

function cvs(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Scatter fine light/dark speckle grain over the whole canvas. */
function grain(x, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    const s = 1 + Math.random() * 2;
    const dark = Math.random() < 0.5;
    x.fillStyle = `rgba(${dark ? '20,16,10' : '255,250,238'},${alpha * Math.random()})`;
    x.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

/** Soft tonal blotches for large-scale variation. */
function blotches(x, w, h, count, colorFn, maxR = 70, alpha = 0.06) {
  for (let i = 0; i < count; i++) {
    const r = 10 + Math.random() * maxR;
    const px = Math.random() * w, py = Math.random() * h;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, colorFn(alpha));
    g.addColorStop(1, colorFn(0));
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

export function canvasTexture(canvas, rx = 1, ry = 1, { srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Concentric-ring accuracy target face (scored by radius from centre). */
export function accuracyTargetCanvas() {
  const c = cvs(), x = c.getContext('2d');
  // gray dish
  x.fillStyle = '#b9b1a4';
  x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 30, (a) => `rgba(140,132,120,${a})`, 80, 0.08);
  // scoring rings (world radii 0.12/0.30/0.55/0.85/1.15 over a 1.2 disc -> px)
  const scale = 256 / 1.2;
  x.strokeStyle = '#e0712a';
  x.lineWidth = 5;
  for (const r of [0.30, 0.55, 0.85, 1.15]) {
    x.beginPath(); x.arc(256, 256, r * scale, 0, Math.PI * 2); x.stroke();
  }
  // bullseye
  x.fillStyle = '#e0712a';
  x.beginPath(); x.arc(256, 256, 0.12 * scale, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(256, 256, 0.05 * scale, 0, Math.PI * 2); x.fill();
  grain(x, 512, 512, 2500, 0.1);
  return c;
}

/** Vertical distance ruler board (5m..50m markings). */
export function rulerCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#5a4a34'; x.fillRect(0, 0, 128, 512);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 128, 512);
  x.strokeStyle = '#e8e0cf'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(34, 20); x.lineTo(34, 492); x.stroke();
  x.fillStyle = '#e8e0cf';
  x.font = 'bold 26px Arial';
  const labels = ['5m', '10m', '20m', '30m', '40m', 'CLEAR', 'BOT'];
  for (let i = 0; i < labels.length; i++) {
    const y = 40 + i * 66;
    x.fillRect(20, y - 2, 28, 4); // tick
    x.fillText(labels[i], 56, y + 8);
  }
  return c;
}

/** Worn tan concrete (floor). */
export function concreteCanvas() {
  const c = cvs(), x = c.getContext('2d');
  x.fillStyle = '#c4b084';
  x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 60, (a) => `rgba(150,130,95,${a})`, 90, 0.08);
  blotches(x, 512, 512, 40, (a) => `rgba(220,205,175,${a})`, 70, 0.06);
  // expansion-joint seams (panel grid)
  x.strokeStyle = 'rgba(60,48,32,0.35)';
  x.lineWidth = 3;
  for (const p of [0, 256]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(512, p); x.stroke(); }
  // a few cracks
  x.strokeStyle = 'rgba(40,30,18,0.4)';
  x.lineWidth = 1.4;
  for (let i = 0; i < 7; i++) {
    x.beginPath();
    let px = Math.random() * 512, py = Math.random() * 512;
    x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (Math.random() - 0.5) * 80; py += (Math.random() - 0.5) * 80; x.lineTo(px, py); }
    x.stroke();
  }
  grain(x, 512, 512, 9000, 0.16);
  return c;
}

/** Painted plaster wall. */
export function plasterCanvas() {
  const c = cvs(), x = c.getContext('2d');
  x.fillStyle = '#d8cbb0';
  x.fillRect(0, 0, 512, 512);
  blotches(x, 512, 512, 50, (a) => `rgba(190,178,150,${a})`, 110, 0.05);
  blotches(x, 512, 512, 30, (a) => `rgba(245,238,220,${a})`, 80, 0.05);
  // faint vertical streaks / grime near edges
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(120,108,84,${0.02 + Math.random() * 0.03})`;
    const px = Math.random() * 512;
    x.fillRect(px, 0, 1 + Math.random() * 2, 512);
  }
  grain(x, 512, 512, 5000, 0.08);
  return c;
}

/** Wood grain (beams / trim). */
export function woodCanvas() {
  const c = cvs(), x = c.getContext('2d');
  x.fillStyle = '#6e5640';
  x.fillRect(0, 0, 512, 512);
  // horizontal planks
  const planks = 6, ph = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const base = 90 + Math.random() * 25;
    x.fillStyle = `rgb(${base + 20},${base - 6},${base - 30})`;
    x.fillRect(0, p * ph, 512, ph - 2);
    // grain lines
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${40 + Math.random() * 30},${28},${18},${0.12 + Math.random() * 0.18})`;
      x.lineWidth = 0.6 + Math.random();
      const y = p * ph + Math.random() * ph;
      x.beginPath(); x.moveTo(0, y);
      for (let s = 0; s <= 512; s += 64) x.lineTo(s, y + (Math.random() - 0.5) * 4);
      x.stroke();
    }
    // plank gap
    x.fillStyle = 'rgba(20,12,6,0.55)';
    x.fillRect(0, p * ph + ph - 3, 512, 3);
  }
  return c;
}

/** Brushed/painted dark metal panels (console, platform). */
export function metalCanvas() {
  const c = cvs(), x = c.getContext('2d');
  x.fillStyle = '#3a3f44';
  x.fillRect(0, 0, 512, 512);
  // horizontal brushed streaks
  for (let i = 0; i < 800; i++) {
    const y = Math.random() * 512;
    x.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,22,26' : '90,96,104'},${0.04 + Math.random() * 0.05})`;
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
  }
  // panel seams + rivets
  x.strokeStyle = 'rgba(15,17,20,0.7)';
  x.lineWidth = 3;
  for (const p of [128, 256, 384]) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.stroke(); }
  x.fillStyle = 'rgba(170,180,190,0.5)';
  for (const px of [128, 256, 384]) for (let py = 24; py < 512; py += 64) { x.beginPath(); x.arc(px, py, 2.2, 0, 7); x.fill(); }
  return c;
}

/** Wooden crate with planks + corner bolts. */
export function crateCanvas() {
  const c = cvs(256), x = c.getContext('2d');
  x.fillStyle = '#b98a4e';
  x.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 5; p++) {
    const base = 150 + Math.random() * 25;
    x.fillStyle = `rgb(${base + 20},${base - 20},${base - 70})`;
    x.fillRect(0, p * 51, 256, 49);
    x.fillStyle = 'rgba(60,38,16,0.6)';
    x.fillRect(0, p * 51 + 49, 256, 3);
  }
  // frame border
  x.strokeStyle = '#7a5424';
  x.lineWidth = 12;
  x.strokeRect(6, 6, 244, 244);
  // corner bolts
  x.fillStyle = '#4a3216';
  for (const bx of [20, 236]) for (const by of [20, 236]) { x.beginPath(); x.arc(bx, by, 5, 0, 7); x.fill(); }
  return c;
}

/** Grayscale noise used as a shared bumpMap for relief on flat surfaces. */
export function bumpCanvas() {
  const c = cvs(256), x = c.getContext('2d');
  x.fillStyle = '#808080';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const v = Math.floor(Math.random() * 256);
    x.fillStyle = `rgba(${v},${v},${v},0.5)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  return c;
}
