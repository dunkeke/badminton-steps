import { V0 } from "./v0-footwork-data.js";

/**
 * Minimal V0 prototype:
 * - click landing cell -> generate plan -> draw path preview
 * - play/pause/replay animation along timeline
 * - speed/reaction sliders feed into V0.plan()
 */

const $ = (id) => document.getElementById(id);

const landingGridEl = $("landingGrid");
const canvas = $("arena");
const ctx = canvas.getContext("2d");

const hudLanding = $("hudLanding");
const hudSeq = $("hudSeq");
const hudSeg = $("hudSeg");
const hudTime = $("hudTime");

const speedEl = $("speed");
const reactionEl = $("reaction");
const speedVal = $("speedVal");
const reactionVal = $("reactionVal");

const btnPlay = $("btnPlay");
const btnPause = $("btnPause");
const btnReplay = $("btnReplay");
const btnCopyPlan = $("btnCopyPlan");

const criteriaBox = $("criteriaBox");
const planBox = $("planBox");

// ---- UI State ----
let selectedLandingId = "F_C";
let plan = null;

// playback state
let playing = false;
let startTs = 0;
let pauseAccum = 0; // ms accumulated paused time
let pausedAt = 0;

// current segment index for HUD/cues
let currentSegIdx = 0;

// ---- Build landing grid buttons ----
function buildLandingButtons() {
  // Order: Front row, Mid row, Rear row (like our LandingGrid)
  const order = ["F_L","F_C","F_R","M_L","M_C","M_R","R_L","R_C","R_R"];
  landingGridEl.innerHTML = "";

  for (const id of order) {
    const cell = V0.LandingGrid.getCell(id);
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.dataset.landingId = id;
    btn.innerHTML = `${cell.label}`;
    btn.addEventListener("click", () => {
      selectLanding(id);
    });
    landingGridEl.appendChild(btn);
  }
}

function setActiveButton(id) {
  [...landingGridEl.querySelectorAll(".btn")].forEach(b => {
    b.classList.toggle("active", b.dataset.landingId === id);
  });
}

function selectLanding(id) {
  selectedLandingId = id;
  setActiveButton(id);
  regeneratePlan();    // update preview immediately
  stopPlayback();      // stay ready
  render();            // draw preview
}

// ---- Sliders ----
function updateSliderLabels() {
  speedVal.textContent = `${Number(speedEl.value).toFixed(2)}×`;
  reactionVal.textContent = `${Number(reactionEl.value)}ms`;
}

speedEl.addEventListener("input", () => {
  updateSliderLabels();
  regeneratePlan();
  render();
});
reactionEl.addEventListener("input", () => {
  updateSliderLabels();
  regeneratePlan();
  render();
});

// ---- Plan generation ----
function regeneratePlan() {
  const cell = V0.LandingGrid.getCell(selectedLandingId);
  const tempo = {
    speed: Number(speedEl.value),
    reactionMs: Number(reactionEl.value),
  };
  plan = V0.plan({ landingId: selectedLandingId, tempo });

  // HUD
  hudLanding.textContent = `落点：${cell?.label ?? selectedLandingId}`;
  hudSeq.textContent = `组合：${plan.meta.sequenceId}`;

  // show plan json in debug box (short)
  planBox.textContent = JSON.stringify(plan, null, 2);

  // show cues of first segment by default
  currentSegIdx = 0;
  updateCriteriaBox(0);
  hudSeg.textContent = `动作段：—`;
  hudTime.textContent = `进度：0%`;
}

// ---- Canvas resize (hiDPI) ----
function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
}

window.addEventListener("resize", () => {
  resizeCanvasToDisplaySize();
  render();
});

// ---- Drawing helpers ----
function drawCourt() {
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;

  // Map normalized coord to canvas pixels (with padding)
  const pad = 24;
  const left = pad;
  const top = pad;
  const right = W - pad;
  const bottom = H - pad;

  // Court boundaries (singles)
  const b = V0.CourtSpec.boundaries.singles;
  const xL = lerp(left, right, b.left);
  const xR = lerp(left, right, b.right);
  const yT = lerp(top, bottom, b.top);
  const yB = lerp(top, bottom, b.bottom);
  const netY = lerp(top, bottom, V0.CourtSpec.netY);

  // background subtle grid
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Outer court
  ctx.strokeStyle = "rgba(232,236,255,.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, xL, yT, xR - xL, yB - yT, 12);
  ctx.stroke();

  // Net
  ctx.strokeStyle = "rgba(232,236,255,.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xL, netY);
  ctx.lineTo(xR, netY);
  ctx.stroke();

  // Center line (visual aid)
  ctx.strokeStyle = "rgba(232,236,255,.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((xL + xR) / 2, yT);
  ctx.lineTo((xL + xR) / 2, yB);
  ctx.stroke();

  ctx.restore();

  return { pad, left, top, right, bottom, xL, xR, yT, yB };
}

function toPx(pos, frame) {
  const { left, top, right, bottom } = frame;
  return {
    x: lerp(left, right, pos.x),
    y: lerp(top, bottom, pos.y),
  };
}

function drawLandingMarkers(frame) {
  // Draw small dots for all cells; highlight selected
  for (const cell of V0.LandingGrid.cells) {
    const p = toPx(cell.center, frame);
    const isSel = cell.id === selectedLandingId;

    ctx.beginPath();
    ctx.fillStyle = isSel ? "rgba(125,180,255,.90)" : "rgba(232,236,255,.22)";
    ctx.arc(p.x, p.y, isSel ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBase(frame) {
  const base = V0.BaseSpec.singles.neutral;
  const p = toPx({ x: base.x, y: base.y }, frame);

  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();

  // ring
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPath(frame) {
  if (!plan) return;
  // Build polyline points from segments
  const pts = [];
  for (const seg of plan.segments) {
    pts.push(toPx(seg.from, frame));
  }
  // add last
  const last = plan.segments[plan.segments.length - 1];
  pts.push(toPx(last.to, frame));

  ctx.save();
  ctx.strokeStyle = "rgba(125,180,255,.45)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Contact points highlight (end of contact segments)
  for (const seg of plan.segments) {
    if (seg.intent === "contact") {
      const p = toPx(seg.to, frame);
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,230,160,.85)";
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawPlayerAt(frame, pos, isGhost = false) {
  const p = toPx(pos, frame);
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = isGhost ? "rgba(232,236,255,.20)" : "rgba(232,236,255,.85)";
  ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Playback timeline math ----
function getTotalDurationMs() {
  if (!plan) return 0;
  // include reaction delay as initial wait
  const reaction = Number(reactionEl.value) || 0;
  const sum = plan.segments.reduce((acc, s) => acc + s.durationMs, 0);
  return reaction + sum;
}

function samplePositionAt(tMs) {
  // tMs includes reaction delay window
  const reaction = Number(reactionEl.value) || 0;
  if (!plan || plan.segments.length === 0) return { pos: V0.BaseSpec.singles.neutral, segIdx: 0, progress: 0 };

  if (tMs <= reaction) {
    return { pos: V0.BaseSpec.singles.neutral, segIdx: 0, progress: 0 };
  }

  let time = tMs - reaction;
  let acc = 0;
  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const nextAcc = acc + seg.durationMs;
    if (time <= nextAcc) {
      const local = (time - acc) / seg.durationMs;
      const pos = {
        x: lerp(seg.from.x, seg.to.x, easeInOut(local)),
        y: lerp(seg.from.y, seg.to.y, easeInOut(local)),
      };
      return { pos, segIdx: i, progress: local };
    }
    acc = nextAcc;
  }
  // end
  const last = plan.segments[plan.segments.length - 1];
  return { pos: last.to, segIdx: plan.segments.length - 1, progress: 1 };
}

function updateCriteriaBox(segIdx) {
  if (!plan) {
    criteriaBox.textContent = "请选择落点…";
    return;
  }
  const seg = plan.segments[segIdx];
  const lines = [
    `当前动作：${seg.name}（${seg.intent}）`,
    "",
    ...(seg.criteria || []).map((c) => `- ${c}`)
  ];
  criteriaBox.textContent = lines.join("\n");
}

// ---- Controls ----
btnPlay.addEventListener("click", () => {
  if (!plan) regeneratePlan();
  startPlayback();
});

btnPause.addEventListener("click", () => {
  pausePlayback();
});

btnReplay.addEventListener("click", () => {
  replayPlayback();
});

btnCopyPlan.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(plan, null, 2));
    btnCopyPlan.textContent = "已复制 ✅";
    setTimeout(() => (btnCopyPlan.textContent = "复制 Plan JSON"), 900);
  } catch {
    alert("复制失败：浏览器不支持或权限不足");
  }
});

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    playing ? pausePlayback() : startPlayback();
  } else if (e.key.toLowerCase() === "r") {
    replayPlayback();
  }
});

function startPlayback() {
  if (!plan) return;
  if (!playing) {
    playing = true;
    if (pausedAt) {
      // resume
      pauseAccum += performance.now() - pausedAt;
      pausedAt = 0;
    } else {
      // first start
      startTs = performance.now();
      pauseAccum = 0;
      currentSegIdx = 0;
      updateCriteriaBox(0);
    }
    requestAnimationFrame(tick);
  }
}

function pausePlayback() {
  if (playing) {
    playing = false;
    pausedAt = performance.now();
  }
}

function stopPlayback() {
  playing = false;
  startTs = 0;
  pauseAccum = 0;
  pausedAt = 0;
  currentSegIdx = 0;
}

function replayPlayback() {
  if (!plan) return;
  stopPlayback();
  render();        // draw preview at start position
  startPlayback();
}

// ---- Main render/tick ----
function render(tMs = 0) {
  resizeCanvasToDisplaySize();

  const frame = drawCourt();
  drawLandingMarkers(frame);
  drawBase(frame);
  drawPath(frame);

  // ghost at base for reference
  drawPlayerAt(frame, V0.BaseSpec.singles.neutral, true);

  // player position (preview: base; playing: sampled)
  const total = getTotalDurationMs();
  const ratio = total > 0 ? (tMs / total) : 0;

  if (plan && total > 0 && tMs > 0) {
    const sample = samplePositionAt(tMs);
    drawPlayerAt(frame, sample.pos, false);

    // HUD segment & cues switch
    if (sample.segIdx !== currentSegIdx) {
      currentSegIdx = sample.segIdx;
      updateCriteriaBox(currentSegIdx);
    }
    hudSeg.textContent = `动作段：${plan.segments[currentSegIdx]?.name ?? "—"}`;
    hudTime.textContent = `进度：${Math.round(Math.min(1, ratio) * 100)}%`;
  } else {
    // idle preview
    drawPlayerAt(frame, V0.BaseSpec.singles.neutral, false);
    hudSeg.textContent = `动作段：—`;
    hudTime.textContent = `进度：0%`;
  }
}

function tick() {
  if (!playing) return;

  const now = performance.now();
  const t = now - startTs - pauseAccum; // ms since start excluding pauses
  const total = getTotalDurationMs();

  if (t >= total) {
    render(total);
    playing = false;
    return;
  }

  render(t);
  requestAnimationFrame(tick);
}

// ---- Utils ----
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) {
  // smoothstep-ish
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- Boot ----
buildLandingButtons();
updateSliderLabels();
setActiveButton(selectedLandingId);
regeneratePlan();
render();
