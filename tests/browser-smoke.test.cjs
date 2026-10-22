"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const physics = require("../physics.js");

test("browser dashboard runs two cranes to completion and exports valid CSV", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }) }, {
    get: (obj, name) => obj[name] || (() => {}),
    set: (obj, name, value) => { obj[name] = value; return true; }
  });
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: { distance: 18, rope: 8, payload: 4000, speed: 2, accel: .75 }[id],
        textContent: "", innerHTML: "", disabled: false,
        handlers: {}, style: {},
        addEventListener(event, listener) { this.handlers[event] = listener; },
        getBoundingClientRect() { return { width: 430, height: 230 }; },
        getContext() { return context; },
        classList: { toggle() {} },
        setAttribute() {}
      });
    }
    return nodes.get(id);
  }
  const rates = [1, 2, 4].map((v) => ({ ...element("rate-" + v), dataset: { rate: String(v) } }));
  let requestFrame, csvParts, downloadCount = 0;
  const document = {
    getElementById: element,
    querySelectorAll: () => rates,
    addEventListener() {},
    body: { appendChild() {} },
    createElement() {
      return { click() { downloadCount++; }, remove() {}, href: "", download: "" };
    }
  };
  const window = {
    AntiSwayPhysics: physics,
    devicePixelRatio: 1,
    addEventListener() {},
    requestAnimationFrame(callback) { requestFrame = callback; },
    setTimeout(callback) { callback(); }
  };
  const url = { createObjectURL: () => "blob:mock", revokeObjectURL() {} };
  class MockBlob { constructor(parts) { csvParts = parts; } }
  vm.runInNewContext(js, { window, document, URL: url, Blob: MockBlob }, { timeout: 3000 });

  // All literal element IDs requested by the app should exist in the dashboard.
  for (const match of js.matchAll(/\$\("([^"]+)"\)/g)) {
    assert.ok(html.includes('id="' + match[1] + '"'), "Missing HTML id: " + match[1]);
  }
  assert.equal(element("run-state").textContent, "READY");
  assert.ok(element("crane-a").width > 0);

  // Exercise pause/resume and run to completion at 4x.
  rates[2].handlers.click();
  element("start-btn").handlers.click();
  requestFrame(0);
  requestFrame(17);
  assert.equal(element("export-btn").disabled, false, "Live samples must be exportable during the run");
  element("start-btn").handlers.click();
  const pausedTime = element("clock").textContent;
  requestFrame(34);
  assert.equal(element("clock").textContent, pausedTime);
  element("start-btn").handlers.click();

  let completed = false;
  for (let i = 2; i < 1500; i++) {
    requestFrame(i * 17);
    if (element("run-state").textContent === "COMPLETE") {
      completed = true; break;
    }
  }
  assert.ok(completed, "Simulation should finish");
  assert.match(element("a-position").innerHTML, /18\.00/);
  assert.match(element("b-position").innerHTML, /18\.00/);
  assert.match(element("reduction").textContent, /%$/);
  assert.equal(element("export-btn").disabled, false);

  // Exported CSV must open as a regular tabular file without comment preamble.
  element("export-btn").handlers.click();
  assert.equal(downloadCount, 1);
  assert.ok(csvParts);
  const csv = String(csvParts[1]);
  const lines = csv.trim().split(/\r?\n/);
  assert.ok(lines[0].startsWith("time_s,standard_x_m,"));
  assert.ok(lines[0].includes("zvd_current_iq_A"));
  assert.ok(lines[0].includes("rope_length_m"));
  assert.ok(lines.length > 1000);
  assert.equal(lines[0].split(",").length, lines[1].split(",").length);

  // Changing parameters resets acquisition and retunes the model.
  element("rope").value = "10";
  element("rope").handlers.input();
  assert.equal(element("run-state").textContent, "READY");
  assert.equal(element("export-btn").disabled, true);
  assert.match(element("period-readout").innerHTML, /6\.34/);
});
