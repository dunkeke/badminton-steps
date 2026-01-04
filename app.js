import { V0 } from "./v0-footwork-data.js";

const $ = (id) => document.getElementById(id);

// --- Elements ---
const landingGridEl = $("landingGrid");
const canvas = $("arena");
const ctx = canvas.getContext("2d");

const hudLanding = $("hudLanding");
const hudSeq = $("hudSeq");
const hudSeg = $("hudSeg");
const hudTime = $("hudTime");

const speedEl = $("speed");
const reactionEl = $("reaction");
const holdEl = $("hold");

const speedVal = $("speedVal");
const reactionVal = $("reactionVal");
const holdVal = $("holdVal");

const btnPlay = $("btnPlay");
const btnPause = $("btnPause");
const btnReplay = $("btnReplay");
const btnCopyPlan = $("btnCopyPlan");

const criteriaBox = $("criteriaBox");
const planBox = $("planBox");

// V0.6 new controls
const modeSingleBtn = $("modeSingle");
const modeSeqBtn = $("modeSeq");
const seqPanel = $("seqPanel");

const btnRandomOne = $("btnRandomOne");
const seqLenEl = $("seqLen");
const seqLenVal = $("seqLenVal");
const autoAdvanceEl = $("autoAdvance");
const btnGenSeq = $("btnGenSeq");
const btnClearSeq = $("btnClearSeq");
const btnNextInSeq = $("btnNextInSeq");
const queueBox = $("queueBox");

// --- State ---
let selectedLandingId = "F_C";
let plan = null;

let playing = false;
let startTs = 0;
let pauseAccum = 0;
let pausedAt = 0;
let currentSegIdx = 0;

let trainingMode = "single"; // "single" | "sequence"
let queue = [];
let queueIdx = 0;

// --- Build landing buttons ---
function buildLandingButtons() {
  const order = ["F_L","F_C","F_R","M_L","M_C","M_R","R_L","R_C","R_R"];
  landingGridEl.innerHTML = "";
  for (const id of order) {
    const cell = V0.LandingGrid.getCell(id);
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.dataset.landingId = id;
    btn.innerHTML = `${cell.label}`;
    btn.addEventListener("click", () => selectLanding(id));
    landingGridEl.appendChild(btn);
  }
}

function setActiveButton(id) {
  [...landingGridEl.querySelectorAll(".btn")].forEach(b => {
    b.classList.toggle("active", b.dataset.landingId === id);
  });
}

function selectLanding(id, { keepQueueIndex = true } = {}) {
  selectedLandingId = id;
  setActiveButton(id);
  regeneratePlan();
  stopPlayback();
  render();

  // If user clicks landing while in sequence mode, we treat it as preview.
  // Keep queueIdx unchanged by default.
  if (!keepQueueIndex && trainingMode === "sequence") {
    queueIdx = 0;
    syncQueueUI();
  }
}

// --- Sliders ---
function updateSliderLabels() {
  speedVal.textContent = `${Number(speedEl.value).toFixed(2)}×`;
  reactionVal.textContent = `${Number(reactionEl.value)}ms`;
  if (holdVal) holdVal.textContent = `${Number(holdEl.value)}ms`;
  if (seqLenVal && seqLenEl) seqLenVal.textContent = `${Number(seqLenEl.value)}`;
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
holdEl?.addEventListener("input", () => {
  updateSliderLabels();
  regeneratePlan();
  render();
});
seqLenEl?.addEventListener("input", () => {
  updateSliderLabels();
});

// --- Mode switching ---
function setMode(mode) {
  trainingMode = mode;
  if (mode === "single") {
    modeSingleBtn.classList.add("primary");
    modeSeqBtn.classList.remove("primary");
    seqPanel.style.display = "none";
  } else {
    modeSeqBtn.classList.add("primary");
    modeSingleBtn.classList.remove("primary");
    seqPanel.style.display = "block";
  }
}

modeSingleBtn?.addEventListener("click", () => setMode("single"));
modeSeqBtn?.addEventListener("click", () => setMode("sequence"));

// --- Random / Queue ---
const LANDING_IDS = ["F_L","F_C","F_R","M_L","M_C","M_R","R_L","R_C","R_R"];

function randomLandingId() {
  return LANDING_IDS[Math.floor(Math.random() * LANDING_IDS.length)];
}

btnRandomOne?.addEventListener("click", () => {
  const id = randomLandingId();
  setMode("single");
  selectLanding(id);
  startPlayback();
});

btnGenSeq?.addEventListener("click", () => {
  setMode("sequence");
  const n = Number(seqLenEl.value);
  queue = Array.from({ length: n }, () => randomLandingId());
  queueIdx = 0;
  syncQueueUI();
  if (queue.length) {
    selectLanding(queue[0]);
    startPlayback();
  }
});

btnClearSeq?.addEventListener("click", () => {
  queue = [];
  queueIdx = 0;
  syncQueueUI();
});

btnNextInSeq?.addEventListener("click", () => {
  if (!queue.length) return;
  queueIdx = Math.min(queueIdx + 1, queue.length - 1);
  syncQueueUI();
  selectLanding(queue[queueIdx]);
  replayPlayback();
});

function syncQueueUI() {
  if (!queueBox) return;
  const renderQueue = queue.map((id, i) => {
    const cell = V0.LandingGrid.getCell(id);
    const mark = (i === queueIdx && trainingMode === "sequence") ? "👉 " : "   ";
    return `${mark}${i+1}. ${id} (${cell?.label ?? ""})`;
  }).join("\n");
  queueBox.textContent = queue.length ? renderQueue : "[]";
}

// --- Plan generation ---
function regeneratePlan() {
  const cell = V0.LandingGrid.getCell(selectedLandingId);
  const tempo = {
    speed: Number(speedEl.value),
    reactionMs: Number(reactionEl.value),
  };
  plan = V0.plan({ landingId: selectedLandingId, tempo });

  hudLanding.textContent = `落点：${cell?.label ?? selectedLandingId}`;
  hudSeq.textContent = `组合：${plan.meta.sequenceId}`;

  planBox.textContent = JSON.stringify(plan, null, 2);

  currentSegIdx = 0;
  updateCriteriaBox(0);
  hudSeg.textContent = `动作段：—`;
  hudTime.textContent = `进度：0%`;
}

// --- Canvas resize ---
function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", () => {
  resizeCanvasToDisplaySize();
  render();
});

// --- Drawing helpers ---
function drawCourt() {
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;

  const pad = 24;
  const left = pad;
  const top = pad;
  const right = W - pad;
  const bottom = H - pad;

  const b = V0.CourtSpec.boundaries.singles;
  const xL = lerp(left, right, b.left);
  const xR = lerp(left, right, b.right);
  const yT = lerp(top, bottom, b.top);
  const yB = lerp(top, bottom, b.bottom);
  const netY = lerp(top, bottom, V0.CourtSpec.netY);

  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // outer court
  ctx.strokeStyle = "rgba(232,236,255,.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, xL, yT, xR - xL, yB - yT, 12);
  ctx.stroke();

  // net
  ctx.strokeStyle = "rgba(232,236,255,.20)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xL, netY);
  ctx.lineTo(xR, netY);
  ctx.stroke();

  // short service line (visual cue)
  const shortY = lerp(top, bottom, V0.CourtSpec.lines.shortServiceY);
  ctx.strokeStyle = "rgba(232,236,255,.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(xL, shortY);
  ctx.lineTo(xR, shortY);
  ctx.stroke();

  // center guide
  ctx.strokeStyle = "rgba(232,236,255,.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo((xL + xR) / 2, yT);
  ctx.lineTo((xL + xR) / 2, yB);
  ctx.stroke();

  ctx.restore();

  return { left, top, right, bottom, xL, xR, yT, yB };
}

function toPx(pos, frame) {
  const { left, top, right, bottom } = frame;
  return { x: lerp(left, right, pos.x), y: lerp(top, bottom, pos.y) };
}

function drawLandingMarkers(frame) {
  // draw as soft tiles for clarity
  for (const cell of V0.LandingGrid.cells) {
    const isSel = cell.id === selectedLandingId;
    const c = toPx(cell.center, frame);

    // tile size heuristic
    const tileW = (frame.right - frame.left) * 0.18;
    const tileH = (frame.bottom - frame.top) * 0.14;

    ctx.save();
    ctx.fillStyle = isSel ? "rgba(125,180,255,.12)" : "rgba(232,236,255,.04)";
    ctx.strokeStyle = isSel ? "rgba(125,180,255,.30)" : "rgba(232,236,255,.10)";
    ctx.lineWidth = 1;
    roundRect(ctx, c.x - tileW/2, c.y - tileH/2, tileW, tileH, 10);
    ctx.fill();
    ctx.stroke();

    // dot
    ctx.beginPath();
    ctx.fillStyle = isSel ? "rgba(125,180,255,.90)" : "rgba(232,236,255,.22)";
    ctx.arc(c.x, c.y, isSel ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawBase(frame) {
  const base = V0.BaseSpec.singles.neutral;
  const p = toPx({ x: base.x, y: base.y }, frame);

  // recover zone ring
  ctx.save();
  ctx.strokeStyle = "rgba(232,236,255,.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
  ctx.stroke();

  // base point
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

// Segment style by intent (no hard colors, just opacity/width)
function segStyle(intent) {
  if (intent === "start")   return { a: 0.18, w: 3 };
  if (intent === "travel")  return { a: 0.28, w: 4 };
  if (intent === "contact") return { a: 0.55, w: 5 };
  if (intent === "recover") return { a: 0.22, w: 4 };
  return { a: 0.25, w: 4 };
}

function footHintForMove(moveId) {
  // heuristic v0.6 (right-handed)
  if (moveId === "LUNGE_BH") return "L";
  if (moveId === "LUNGE_FH") return "R";
  if (moveId === "SCISSOR") return "R"; // dominant landing cue (simplified)
  return "";
}

function drawPath(frame) {
  if (!plan) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // draw per segment
  for (const seg of plan.segments) {
    const p1 = toPx(seg.from, frame);
    const p2 = toPx(seg.to, frame);
    const st = segStyle(seg.intent);

    ctx.strokeStyle = `rgba(125,180,255,${st.a})`;
    ctx.lineWidth = st.w;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // contact marker + foot hint
    if (seg.intent === "contact") {
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,230,160,.85)";
      ctx.arc(p2.x, p2.y, 7, 0, Math.PI * 2);
      ctx.fill();

      const foot = footHintForMove(seg.moveId);
      if (foot) {
        ctx.font = "12px ui-sans-serif, system-ui";
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.fillText(foot, p2.x + 10, p2.y - 8);
        ctx.fillStyle = "rgba(232,236,255,.55)";
        ctx.fillText("foot", p2.x + 22, p2.y - 8);
      }
    }
  }

  ctx.restore();
}

function headingFromSegment(seg) {
  if (!seg) return -Math.PI / 2;
  const dx = seg.to.x - seg.from.x;
  const dy = seg.to.y - seg.from.y;
  if (Math.hypot(dx, dy) < 0.001) {
    return -Math.PI / 2;
  }
  return Math.atan2(dy, dx);
}

function drawHeadingArrow(p, heading, opts = {}) {
  const { color = "rgba(125,180,255,.85)", length = 22 } = opts;
  const tipX = p.x + Math.cos(heading) * length;
  const tipY = p.y + Math.sin(heading) * length;
  const left = heading + Math.PI * 0.75;
  const right = heading - Math.PI * 0.75;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + Math.cos(left) * 8, tipY + Math.sin(left) * 8);
  ctx.lineTo(tipX + Math.cos(right) * 8, tipY + Math.sin(right) * 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFootprint(x, y, heading, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFootprintsAt(frame, pos, heading, opts = {}) {
  const {
    ghost = false,
    highlightFoot = "",
  } = opts;
  const p = toPx(pos, frame);
  const spread = 9;
  const perp = heading - Math.PI / 2;
  const offsetX = Math.cos(perp) * spread;
  const offsetY = Math.sin(perp) * spread;

  const baseColor = ghost ? "rgba(232,236,255,.35)" : "rgba(232,236,255,.85)";
  const highlightColor = "rgba(255,230,160,.95)";

  const left = { x: p.x + offsetX, y: p.y + offsetY };
  const right = { x: p.x - offsetX, y: p.y - offsetY };

  drawFootprint(
    left.x,
    left.y,
    heading,
    highlightFoot === "L" ? highlightColor : baseColor,
    ghost ? 0.4 : 1
  );
  drawFootprint(
    right.x,
    right.y,
    heading,
    highlightFoot === "R" ? highlightColor : baseColor,
    ghost ? 0.4 : 1
  );

  if (!ghost) {
    drawHeadingArrow(p, heading, { color: "rgba(125,180,255,.75)" });
  }
}

// --- Playback timeline ---
function getTotalDurationMs() {
  if (!plan) return 0;
  const reaction = Number(reactionEl.value) || 0;
  const hold = Number(holdEl?.value ?? 0) || 0;

  // add hold time after each contact segment (v0.6)
  const sum = plan.segments.reduce((acc, s) => {
    const extra = (s.intent === "contact") ? hold : 0;
    return acc + s.durationMs + extra;
  }, 0);
  return reaction + sum;
}

function samplePositionAt(tMs) {
  const reaction = Number(reactionEl.value) || 0;
  const hold = Number(holdEl?.value ?? 0) || 0;

  if (!plan || plan.segments.length === 0) {
    return { pos: V0.BaseSpec.singles.neutral, segIdx: 0, progress: 0 };
  }
  if (tMs <= reaction) {
    return { pos: V0.BaseSpec.singles.neutral, segIdx: 0, progress: 0 };
  }

  let time = tMs - reaction;
  let acc = 0;

  for (let i = 0; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const extra = (seg.intent === "contact") ? hold : 0;
    const segSpan = seg.durationMs + extra;
    const nextAcc = acc + segSpan;

    if (time <= nextAcc) {
      // if in hold window (after movement finished)
      if (seg.intent === "contact" && time > acc + seg.durationMs) {
        return { pos: seg.to, segIdx: i, progress: 1 };
      }

      const local = (time - acc) / seg.durationMs;
      const pos = {
        x: lerp(seg.from.x, seg.to.x, easeInOut(local)),
        y: lerp(seg.from.y, seg.to.y, easeInOut(local)),
      };
      return { pos, segIdx: i, progress: local };
    }
    acc = nextAcc;
  }

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

// --- Controls ---
btnPlay.addEventListener("click", () => {
  if (!plan) regeneratePlan();
  startPlayback();
});
btnPause.addEventListener("click", () => pausePlayback());
btnReplay.addEventListener("click", () => replayPlayback());

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
  } else if (e.key.toLowerCase() === "n") {
    if (trainingMode === "sequence") btnNextInSeq?.click();
  }
});

function startPlayback() {
  if (!plan) return;
  if (!playing) {
    playing = true;
    if (pausedAt) {
      pauseAccum += performance.now() - pausedAt;
      pausedAt = 0;
    } else {
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
  render();
  startPlayback();
}

// --- Render loop ---
function render(tMs = 0) {
  resizeCanvasToDisplaySize();

  const frame = drawCourt();
  drawLandingMarkers(frame);
  drawBase(frame);
  drawPath(frame);

  drawFootprintsAt(frame, V0.BaseSpec.singles.neutral, -Math.PI / 2, { ghost: true });

  const total = getTotalDurationMs();
  const ratio = total > 0 ? (tMs / total) : 0;

  if (plan && total > 0 && tMs > 0) {
    const sample = samplePositionAt(tMs);
    const seg = plan.segments[sample.segIdx];
    const heading = headingFromSegment(seg);
    const highlightFoot = seg?.intent === "contact" ? footHintForMove(seg.moveId) : "";
    drawFootprintsAt(frame, sample.pos, heading, { highlightFoot });

    if (sample.segIdx !== currentSegIdx) {
      currentSegIdx = sample.segIdx;
      updateCriteriaBox(currentSegIdx);
    }
    hudSeg.textContent = `动作段：${plan.segments[currentSegIdx]?.name ?? "—"}`;
    hudTime.textContent = `进度：${Math.round(Math.min(1, ratio) * 100)}%`;
  } else {
    drawFootprintsAt(frame, V0.BaseSpec.singles.neutral, -Math.PI / 2);
    hudSeg.textContent = `动作段：—`;
    hudTime.textContent = `进度：0%`;
  }
}

function tick() {
  if (!playing) return;

  const now = performance.now();
  const t = now - startTs - pauseAccum;
  const total = getTotalDurationMs();

  if (t >= total) {
    render(total);
    playing = false;

    // auto-advance if sequence mode
    if (trainingMode === "sequence" && autoAdvanceEl?.checked && queue.length) {
      const next = queueIdx + 1;
      if (next < queue.length) {
        queueIdx = next;
        syncQueueUI();
        selectLanding(queue[queueIdx]);
        replayPlayback();
      }
    }
    return;
  }

  render(t);
  requestAnimationFrame(tick);
}

// --- Utils ---
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) {
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

// --- Boot ---
buildLandingButtons();
updateSliderLabels();
setActiveButton(selectedLandingId);
setMode("single");
syncQueueUI();
regeneratePlan();
render();
