// ============================================================
// ui.html content for Proxy Fetch Tester plugin (US-RUN-07)
//
// UI with buttons to trigger each proxy fetch test:
//   - GET/POST JSON (jsonplaceholder - allowed)
//   - GET text + clone() (jsonplaceholder - allowed)
//   - GET blocked domains (google.com, example.org)
//   - Run all tests
//
// Results displayed inline with pass/fail indicators.
// Runs in Figma iframe: has DOM, fetch, window.
// ============================================================

export const UI_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Inter, system-ui, sans-serif;
    padding: 12px;
    background: #fff;
    color: #333;
    font-size: 12px;
  }
  h1 { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
  .subtitle { color: #999; font-size: 10px; margin-bottom: 12px; }

  .section {
    margin-bottom: 10px;
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    overflow: hidden;
  }
  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    padding: 6px 10px;
    background: #fafafa;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-title .badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
  }
  .badge-ok { background: #e8f5e9; color: #2e7d32; }
  .badge-blocked { background: #fce4ec; color: #c62828; }
  .section-body {
    padding: 8px 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    transition: background 0.12s, transform 0.08s;
  }
  button:active { transform: scale(0.97); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-primary { background: #1565c0; color: #fff; }
  .btn-primary:hover:not(:disabled) { background: #0d47a1; }
  .btn-ok { background: #e3f2fd; color: #1565c0; }
  .btn-ok:hover:not(:disabled) { background: #bbdefb; }
  .btn-blocked { background: #fce4ec; color: #c62828; }
  .btn-blocked:hover:not(:disabled) { background: #f8bbd0; }
  .btn-neutral { background: #f0f0f0; color: #333; }
  .btn-neutral:hover:not(:disabled) { background: #e0e0e0; }
  .btn-danger { background: #c62828; color: #fff; }
  .btn-danger:hover:not(:disabled) { background: #b71c1c; }
  .btn-full { width: 100%; }

  .results {
    margin-top: 10px;
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    overflow: hidden;
  }
  .results-header {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    padding: 6px 10px;
    background: #fafafa;
    border-bottom: 1px solid #e8e8e8;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .results-body {
    max-height: 180px;
    overflow-y: auto;
  }
  .result-entry {
    padding: 5px 10px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 11px;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }
  .result-entry:last-child { border-bottom: none; }
  .result-icon {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    font-weight: 700;
    font-size: 12px;
  }
  .result-icon.pass { color: #2e7d32; }
  .result-icon.fail { color: #c62828; }
  .result-icon.pending { color: #f57f17; }
  .result-content { flex: 1; min-width: 0; }
  .result-summary { font-weight: 500; }
  .result-detail { color: #888; font-size: 10px; margin-top: 1px; word-break: break-all; }
  .result-elapsed { color: #aaa; font-size: 9px; flex-shrink: 0; }

  .stats {
    display: flex;
    gap: 8px;
    font-size: 10px;
    font-weight: 500;
  }
  .stat-pass { color: #2e7d32; }
  .stat-fail { color: #c62828; }

  #status-bar {
    margin-top: 6px;
    padding: 4px 8px;
    background: #f5f5f5;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 10px;
    color: #666;
    min-height: 20px;
  }
</style>
</head>
<body>

<h1>Proxy Fetch Tester</h1>
<p class="subtitle">US-RUN-07 - Test fetch() via proxy edge function from code.js sandbox</p>

<div class="section">
  <div class="section-title">
    Allowed domain (jsonplaceholder.typicode.com)
    <span class="badge badge-ok">ALLOWED</span>
  </div>
  <div class="section-body">
    <button class="btn-ok" onclick="runTest('test-get-json')">GET /posts/1</button>
    <button class="btn-ok" onclick="runTest('test-get-users')">GET /users</button>
    <button class="btn-ok" onclick="runTest('test-post-json')">POST /posts</button>
    <button class="btn-ok" onclick="runTest('test-get-text')">.text()</button>
    <button class="btn-ok" onclick="runTest('test-clone')">.clone()</button>
    <button class="btn-ok" onclick="runTest('test-query-params')">?userId=1</button>
  </div>
</div>

<div class="section">
  <div class="section-title">
    Blocked domains
    <span class="badge badge-blocked">SHOULD FAIL</span>
  </div>
  <div class="section-body">
    <button class="btn-blocked" onclick="runTest('test-blocked-domain')">google.com</button>
    <button class="btn-blocked" onclick="runTest('test-blocked-domain-2')">example.org</button>
  </div>
</div>

<div class="section">
  <div class="section-body" style="flex-direction: column; gap: 6px;">
    <button class="btn-primary btn-full" id="btn-run-all" onclick="runAll()">Run all tests</button>
    <div style="display: flex; gap: 6px;">
      <button class="btn-neutral" style="flex:1;" onclick="clearResults()">Clear results</button>
      <button class="btn-danger" onclick="send('close')" style="font-size: 10px; padding: 4px 8px;">Close</button>
    </div>
  </div>
</div>

<div class="results">
  <div class="results-header">
    <span>Results</span>
    <div class="stats">
      <span class="stat-pass" id="stat-pass">0 pass</span>
      <span class="stat-fail" id="stat-fail">0 fail</span>
    </div>
  </div>
  <div class="results-body" id="results-body">
    <div class="result-entry" style="color: #aaa; justify-content: center;">
      Run a test to see results
    </div>
  </div>
</div>

<div id="status-bar">Ready</div>

<script>
  var resultsEl = document.getElementById('results-body');
  var statusBar = document.getElementById('status-bar');
  var statPass = document.getElementById('stat-pass');
  var statFail = document.getElementById('stat-fail');
  var passCount = 0;
  var failCount = 0;
  var firstResult = true;

  function updateStats() {
    statPass.textContent = passCount + ' pass';
    statFail.textContent = failCount + ' fail';
  }

  function setStatus(msg) {
    statusBar.textContent = msg;
  }

  function send(type, extra) {
    var msg = Object.assign({ type: type, testId: type }, extra || {});
    parent.postMessage({ pluginMessage: msg }, '*');
  }

  function runTest(testType) {
    setStatus('Running: ' + testType + '...');
    // Add pending entry
    addPendingResult(testType);
    send(testType);
  }

  function runAll() {
    clearResults();
    setStatus('Running all tests...');
    document.getElementById('btn-run-all').disabled = true;
    send('test-run-all');
  }

  function clearResults() {
    resultsEl.innerHTML = '<div class="result-entry" style="color: #aaa; justify-content: center;">Run a test to see results</div>';
    passCount = 0;
    failCount = 0;
    firstResult = true;
    updateStats();
    setStatus('Ready');
  }

  function addPendingResult(testId) {
    if (firstResult) {
      resultsEl.innerHTML = '';
      firstResult = false;
    }
    var el = document.createElement('div');
    el.className = 'result-entry';
    el.id = 'result-' + testId;
    el.innerHTML = '<span class="result-icon pending">...</span>' +
      '<div class="result-content"><div class="result-summary">' + testId + '</div>' +
      '<div class="result-detail">pending...</div></div>';
    resultsEl.appendChild(el);
    resultsEl.scrollTop = resultsEl.scrollHeight;
  }

  function addResult(testId, ok, summary, detail, elapsed) {
    if (firstResult) {
      resultsEl.innerHTML = '';
      firstResult = false;
    }

    // Update existing pending entry or create new
    var existing = document.getElementById('result-' + testId);
    if (existing) {
      existing.innerHTML = '<span class="result-icon ' + (ok ? 'pass' : 'fail') + '">' + (ok ? '\\u2713' : '\\u2717') + '</span>' +
        '<div class="result-content"><div class="result-summary">' + summary + '</div>' +
        '<div class="result-detail">' + (detail || '') + '</div></div>' +
        '<span class="result-elapsed">' + (elapsed || '') + '</span>';
    } else {
      var el = document.createElement('div');
      el.className = 'result-entry';
      el.innerHTML = '<span class="result-icon ' + (ok ? 'pass' : 'fail') + '">' + (ok ? '\\u2713' : '\\u2717') + '</span>' +
        '<div class="result-content"><div class="result-summary">' + summary + '</div>' +
        '<div class="result-detail">' + (detail || '') + '</div></div>' +
        '<span class="result-elapsed">' + (elapsed || '') + '</span>';
      resultsEl.appendChild(el);
    }

    if (ok) passCount++;
    else failCount++;
    updateStats();
    resultsEl.scrollTop = resultsEl.scrollHeight;
  }

  window.onmessage = function(event) {
    var msg = event.data.pluginMessage;
    if (!msg) return;

    switch (msg.type) {
      case 'test-result':
        addResult(msg.testId, msg.ok, msg.summary, msg.detail, msg.elapsed);
        setStatus('Last: ' + msg.summary);
        break;

      case 'status':
        setStatus(msg.message);
        break;

      case 'all-done':
        setStatus('All tests complete: ' + passCount + ' pass, ' + failCount + ' fail');
        document.getElementById('btn-run-all').disabled = false;
        break;
    }
  };

  setStatus('UI loaded - fetch type in sandbox will be logged on first test');
</script>
</body>
</html>`.trim();
