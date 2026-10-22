/* Browser-side crane animation, live scopes and CSV data recording. */
(function () {
  "use strict";
  const P = window.AntiSwayPhysics;
  if (!P) throw new Error("physics.js must be loaded before app.js");
  const $ = (id) => document.getElementById(id);
  const inputs = ["distance", "rope", "payload", "speed", "accel"];
  const cvs = { a: $("crane-a"), b: $("crane-b"),
    velocity: $("scope-velocity"), current: $("scope-current"), angle: $("scope-angle") };
  const colors = { standard: "#ffad68", shaped: "#65e5dc" };
  let scenario = null;
  let mode = "ready";
  let rate = 1;
  let lastFrame = null;
  let remainder = 0;
  let lastPaint = -1;

  function configFromInputs() {
    const c = {};
    inputs.forEach((id) => { c[id] = Number($(id).value); });
    return c;
  }

  function pretty(n, digits) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function updateInputs(c) {
    $("distance-out").textContent = pretty(c.distance, 0) + " m";
    $("rope-out").textContent = pretty(c.rope, c.rope % 1 ? 1 : 0) + " m";
    $("payload-out").textContent = pretty(c.payload, 0) + " kg";
    $("speed-out").textContent = pretty(c.speed, 1) + " m/s";
    $("accel-out").textContent = pretty(c.accel, 2) + " m/s²";
    $("period-readout").innerHTML = pretty(scenario.T, 2) + "<span> s</span>";
    $("endpoint-a").textContent = pretty(c.distance, 0) + " m / TARGET";
    $("endpoint-b").textContent = pretty(c.distance, 0) + " m / TARGET";
  }

  function configure() {
    scenario = P.makeScenario(configFromInputs());
    updateInputs(scenario.cfg);
    mode = "ready";
    remainder = 0;
    lastFrame = null;
    lastPaint = -1;
    $("residual-a").textContent = "—";
    $("residual-b").textContent = "—";
    $("reduction").textContent = "—";
    $("result-detail").textContent = "Run the simulation to compare the residual oscillation after each trolley stops.";
    refreshControls();
    drawAll();
  }

  function refreshControls() {
    $("run-state").textContent = mode.toUpperCase();
    $("live-status").textContent = mode === "running" ? "ACQUIRING DATA" :
      mode === "complete" ? "EXPERIMENT COMPLETE" : mode === "paused" ? "ACQUISITION PAUSED" : "READY TO SIMULATE";
    $("start-glyph").textContent = mode === "running" ? "Ⅱ" : mode === "complete" ? "↺" : "▶";
    $("start-label").textContent = mode === "running" ? "Pause simulation" :
      mode === "paused" ? "Resume simulation" : mode === "complete" ? "Run again" : "Run simulation";
    $("export-btn").disabled = !scenario || scenario.standard.history.t.length < 2;
  }

  function toggleRunning() {
    if (mode === "complete") configure();
    mode = mode === "running" ? "paused" : "running";
    lastFrame = null;
    refreshControls();
  }

  function finish() {
    mode = "complete";
    remainder = 0;
    const r = P.results(scenario);
    if (r) {
      $("residual-a").textContent = pretty(r.standardRms, 3) + "°";
      $("residual-b").textContent = pretty(r.shapedRms, 3) + "°";
      $("reduction").textContent = r.reduction == null ? "n/a" : pretty(r.reduction, 1) + "%";
      $("result-detail").textContent = "Both trolleys completed the same " + pretty(scenario.cfg.distance, 0) +
        " m transfer. ZVD reaches the destination " + pretty(scenario.T, 2) +
        " s later; residual sway is evaluated during the first natural period after each stop.";
    }
    lastPaint = -1;
    refreshControls();
  }

  function getDrawingContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function line(ctx, x1, y1, x2, y2, color, width, dash) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width || 1;
    ctx.setLineDash(dash || []);
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }

  function rectangle(ctx, x, y, w, h, color, stroke) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h); }
  }

  function drawCrane(canvas, plant, key) {
    const dc = getDrawingContext(canvas);
    if (!dc) return;
    const { ctx, w, h } = dc;
    const accent = colors[key];
    const left = 23, right = w - 23, railY = 61, groundY = h - 23;
    const progress = Math.max(0, Math.min(1, plant.x / scenario.cfg.distance));
    const start = left + 23, end = right - 23;
    const trolleyX = start + (end - start) * progress;
    const ropePx = Math.min(scenario.cfg.rope * 10, Math.max(54, h - 128));
    const hookY = railY + 25;
    const loadX = trolleyX + ropePx * Math.sin(plant.theta);
    const loadY = hookY + ropePx * Math.cos(plant.theta);

    ctx.clearRect(0, 0, w, h);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#182735"); gradient.addColorStop(1, "#101922");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 30) line(ctx, x, 0, x, h, "#1c2c39", 0.7);
    for (let y = 0; y < h; y += 30) line(ctx, 0, y, w, y, "#1a2a36", 0.7);

    rectangle(ctx, left - 6, railY + 2, 9, groundY - railY, "#263b48");
    rectangle(ctx, right - 3, railY + 2, 9, groundY - railY, "#263b48");
    rectangle(ctx, left - 9, groundY - 4, 18, 8, "#3b4e59");
    rectangle(ctx, right - 7, groundY - 4, 18, 8, "#3b4e59");
    rectangle(ctx, left - 3, railY - 8, right - left + 6, 11, "#334957", "#486070");
    line(ctx, left, railY - 11, right, railY - 11, "#527384", 1);
    for (let x = left + 3; x < right; x += 24) {
      line(ctx, x, railY - 7, x + 12, railY + 1, "#44606b", 1);
    }
    line(ctx, left - 9, groundY + 4, right + 10, groundY + 4, "#46606b", 2);
    line(ctx, end, railY + 15, end, groundY + 1, "#37535a", 1, [4, 5]);
    line(ctx, trolleyX, railY + 13, trolleyX, groundY, "#384d59", 1, [3, 6]);

    // Ghosted payload equilibrium line makes residual oscillation visible.
    ctx.fillStyle = "#647f8b";
    ctx.font = "9px monospace";
    ctx.fillText("0 m", start - 13, 26);
    ctx.textAlign = "right"; ctx.fillText(pretty(scenario.cfg.distance, 0) + " m", end + 12, 26);
    ctx.textAlign = "left";
    rectangle(ctx, trolleyX - 19, railY - 16, 38, 18, "#273a49", accent);
    rectangle(ctx, trolleyX - 14, railY - 13, 28, 10, accent);
    rectangle(ctx, trolleyX - 23, railY - 4, 9, 9, "#8ba0ae");
    rectangle(ctx, trolleyX + 14, railY - 4, 9, 9, "#8ba0ae");
    rectangle(ctx, trolleyX - 3, railY + 2, 6, 22, "#a0b6bd");
    ctx.strokeStyle = "#a9bbbf"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(trolleyX, hookY); ctx.lineTo(loadX, loadY); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(trolleyX, hookY, 3, 0, 2 * Math.PI); ctx.fill();

    // Highlight load angle relative to hanging vertical.
    if (Math.abs(plant.theta) > 0.001) {
      ctx.beginPath(); ctx.arc(trolleyX, hookY, 18,
        Math.PI / 2, Math.PI / 2 - plant.theta, plant.theta > 0);
      ctx.strokeStyle = accent; ctx.lineWidth = 1.1; ctx.stroke();
    }

    ctx.shadowColor = accent; ctx.shadowBlur = 8;
    rectangle(ctx, loadX - 23, loadY - 6, 46, 29, "#29404a", accent);
    ctx.shadowBlur = 0;
    rectangle(ctx, loadX - 19, loadY - 2, 38, 3, accent);
    rectangle(ctx, loadX - 16, loadY + 12, 32, 2, "#52727c");
    line(ctx, loadX - 16, loadY + 3, loadX + 16, loadY + 17, "#52727c", 1);
    line(ctx, loadX + 16, loadY + 3, loadX - 16, loadY + 17, "#52727c", 1);
    rectangle(ctx, loadX - 15, loadY + 23, 8, 3, "#718994");
    rectangle(ctx, loadX + 7, loadY + 23, 8, 3, "#718994");

    ctx.textAlign = "left"; ctx.fillStyle = accent;
    ctx.font = "bold 9px monospace";
    ctx.fillText(key === "standard" ? "RAMP / A" : "ZVD / B", 14, 18);
    ctx.textAlign = "right"; ctx.fillStyle = "#7f9aa9";
    ctx.font = "10px monospace"; ctx.fillText(pretty(scenario.t, 1) + " s", w - 14, 18);
    ctx.textAlign = "left";
  }

  function drawScopes(canvas, metric) {
    const dc = getDrawingContext(canvas);
    if (!dc) return;
    const { ctx, w, h } = dc;
    ctx.clearRect(0, 0, w, h);
    const left = 49, right = w - 11, top = 17, bottom = h - 26;
    const ww = Math.max(10, right - left), hh = bottom - top;
    const ht = scenario.standard.history, hs = scenario.shaped.history;
    let maxV;
    if (metric === "velocity") maxV = Math.max(0.5, scenario.cfg.speed * 1.15);
    else {
      let peak = 0;
      const key = metric === "angle" ? "theta" : "current";
      for (const arr of [ht[key], hs[key]]) {
        // UI-only dynamic axis scaling; sample traces remain unmodified.
        for (let i = 0; i < arr.length; i += 1) peak = Math.max(peak, Math.abs(arr[i]));
      }
      maxV = metric === "angle" ? Math.max(2, peak * 180 / Math.PI * 1.25) : Math.max(20, peak * 1.2);
    }
    const minV = metric === "velocity" ? 0 : -maxV;
    const val = (history, i) => metric === "angle" ? history.theta[i] * 180 / Math.PI : history[metric][i];
    const xp = (t) => left + ww * (t / scenario.end);
    const yp = (v) => bottom - (v - minV) / (maxV - minV) * hh;

    for (let i = 0; i <= 4; i++) {
      const t = i / 4 * scenario.end;
      const x = left + ww * i / 4;
      line(ctx, x, top, x, bottom, "#263541", 0.8, [3, 5]);
      ctx.textAlign = "center"; ctx.fillStyle = "#7890a2"; ctx.font = "10px monospace";
      ctx.fillText(pretty(t, 0) + "s", x, h - 8);
      const y = top + hh * i / 4;
      line(ctx, left, y, right, y, "#2b3d4a", 0.8, [3, 5]);
      const v = maxV - (maxV - minV) * i / 4;
      ctx.textAlign = "right";
      ctx.fillText(Math.abs(v) < 0.005 ? "0" : pretty(v, metric === "velocity" ? 1 : 0), left - 8, y + 3);
    }
    if (minV < 0) line(ctx, left, yp(0), right, yp(0), "#4b6373", 1);
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, ww, hh); ctx.clip();
    for (const [history, color] of [[ht, colors.standard], [hs, colors.shaped]]) {
      ctx.beginPath(); ctx.lineWidth = 1.9; ctx.strokeStyle = color;
      const count = history.t.length;
      const stride = Math.max(1, Math.floor(count / (ww * 2)));
      for (let i = 0; i < count; i += stride) {
        const x = xp(history.t[i]), y = yp(val(history, i));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (count > 1 && (count - 1) % stride !== 0) {
        ctx.lineTo(xp(history.t[count - 1]), yp(val(history, count - 1)));
      }
      ctx.stroke();
    }
    const playhead = xp(scenario.t);
    line(ctx, playhead, top, playhead, bottom, "#8293a055", 1, [3, 4]);
    ctx.restore();
  }

  function paintMetrics(key, plant) {
    const prefix = key === "standard" ? "a" : "b";
    $(prefix + "-position").innerHTML = pretty(plant.x, 2) + " <small>m</small>";
    $(prefix + "-velocity").innerHTML = pretty(plant.v, 2) + " <small>m/s</small>";
    $(prefix + "-angle").innerHTML = pretty(plant.theta * 180 / Math.PI, 2) + " <small>°</small>";
    $(prefix + "-current").innerHTML = pretty(plant.current, 1) + " <small>A</small>";
    $(prefix === "a" ? "progress-a" : "progress-b").style.width =
      Math.max(0, Math.min(100, plant.x / scenario.cfg.distance * 100)) + "%";
  }

  function drawAll() {
    if (!scenario) return;
    const time = scenario.t;
    $("clock").textContent = String(Math.floor(time / 60)).padStart(2, "0") + ":" +
      pretty(time % 60, 2).padStart(5, "0");
    paintMetrics("standard", scenario.standard);
    paintMetrics("shaped", scenario.shaped);
    drawCrane(cvs.a, scenario.standard, "standard");
    drawCrane(cvs.b, scenario.shaped, "shaped");
    drawScopes(cvs.velocity, "velocity");
    drawScopes(cvs.current, "current");
    drawScopes(cvs.angle, "angle");
  }

  function animationLoop(now) {
    if (mode === "running") {
      if (lastFrame !== null) remainder += Math.min((now - lastFrame) / 1000, 0.1) * rate;
      let n = 0;
      while (remainder >= P.DT && !scenario.done && n < 64) {
        P.step(scenario);
        remainder -= P.DT;
        n++;
      }
      if (scenario.done) finish();
    }
    lastFrame = now;
    if (mode === "running" || lastPaint < 0) {
      // Keep scope updates near the monitor frame rate; the stored data is 120Hz.
      if (lastPaint < 0 || now - lastPaint > 16) {
        drawAll(); lastPaint = now;
      }
    }
    window.requestAnimationFrame(animationLoop);
  }

  function exportCsv() {
    if (!scenario || scenario.standard.history.t.length < 2) return;
    const a = scenario.standard.history, b = scenario.shaped.history;
    const heading = ["time_s", "standard_x_m", "standard_velocity_mps", "standard_acceleration_mps2",
      "standard_angle_deg", "standard_current_iq_A",
      "zvd_x_m", "zvd_velocity_mps", "zvd_acceleration_mps2", "zvd_angle_deg", "zvd_current_iq_A"];
    const rows = [heading.join(",")];
    const num = (v) => Number(v).toFixed(6);
    for (let i = 0; i < a.t.length; i++) {
      rows.push([a.t[i], a.x[i], a.v[i], a.a[i], a.theta[i] * 180 / Math.PI, a.current[i],
        b.x[i], b.v[i], b.a[i], b.theta[i] * 180 / Math.PI, b.current[i]].map(num).join(","));
    }
    const csv = "# Anti-Sway Lab: modeled Iq-equivalent current, NOT measured electrical RMS current\n" +
      "# Config: distance=" + scenario.cfg.distance + " m; rope=" + scenario.cfg.rope +
      " m; payload=" + scenario.cfg.payload + " kg; v_max=" + scenario.cfg.speed +
      " m/s; acceleration=" + scenario.cfg.accel + " m/s^2; period=" + num(scenario.T) + " s\n" +
      rows.join("\n") + "\n";
    const objectUrl = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const aTag = document.createElement("a");
    aTag.href = objectUrl;
    aTag.download = "antisway-scope-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(aTag);
    aTag.click();
    aTag.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }

  inputs.forEach((id) => $(id).addEventListener("input", configure));
  $("start-btn").addEventListener("click", toggleRunning);
  $("reset-btn").addEventListener("click", configure);
  $("export-btn").addEventListener("click", exportCsv);
  document.querySelectorAll(".rate").forEach((button) => {
    button.addEventListener("click", () => {
      rate = Number(button.dataset.rate);
      document.querySelectorAll(".rate").forEach((other) => {
        const active = other === button;
        other.classList.toggle("active", active);
        other.setAttribute("aria-pressed", String(active));
      });
    });
  });
  window.addEventListener("resize", drawAll);
  document.addEventListener("visibilitychange", () => { lastFrame = null; });
  configure();
  window.requestAnimationFrame(animationLoop);
})();