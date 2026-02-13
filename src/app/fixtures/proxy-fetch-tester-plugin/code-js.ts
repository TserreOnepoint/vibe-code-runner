// ============================================================
// code.js content for Proxy Fetch Tester plugin (US-RUN-07)
//
// Tests the custom fetch() injected by the Runner:
//   - GET/POST to jsonplaceholder.typicode.com (allowed domain)
//   - GET to google.com (blocked domain)
//   - Timeout simulation
//   - Response methods: .json(), .text(), .clone()
//
// fetch() is injected as 2nd parameter by the executor:
//   new Function('figma', 'fetch', code)
//
// Runs in Figma sandbox: no DOM, no native fetch, no window.
// ============================================================

export const CODE_JS = `
figma.showUI(__html__, { width: 400, height: 560 });

console.log('[ProxyFetchTester] Plugin started - fetch available:', typeof fetch);

figma.ui.onmessage = async (msg) => {
  var testId = msg.testId || 'unknown';
  var startTime = Date.now();

  function elapsed() {
    return (Date.now() - startTime) + 'ms';
  }

  function sendResult(ok, summary, detail) {
    figma.ui.postMessage({
      type: 'test-result',
      testId: testId,
      ok: ok,
      summary: summary,
      detail: detail,
      elapsed: elapsed()
    });
  }

  switch (msg.type) {

    // -------------------------------------------------------
    // TEST 1: GET JSON (allowed domain)
    // -------------------------------------------------------
    case 'test-get-json': {
      console.log('[Test] GET /posts/1 from jsonplaceholder');
      try {
        var res = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        console.log('[Test] Response status:', res.status, res.statusText);
        console.log('[Test] Response ok:', res.ok);
        var data = await res.json();
        console.log('[Test] Data received:', JSON.stringify(data).substring(0, 200));
        if (data && data.id === 1 && data.title) {
          sendResult(true, 'GET /posts/1 -> ' + res.status, 'Post title: ' + data.title.substring(0, 50));
        } else {
          sendResult(false, 'GET /posts/1 -> unexpected data', JSON.stringify(data).substring(0, 100));
        }
      } catch (err) {
        console.error('[Test] GET /posts/1 failed:', err.message);
        sendResult(false, 'GET /posts/1 -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 2: GET JSON array (allowed domain)
    // -------------------------------------------------------
    case 'test-get-users': {
      console.log('[Test] GET /users from jsonplaceholder');
      try {
        var res = await fetch('https://jsonplaceholder.typicode.com/users');
        console.log('[Test] Response status:', res.status);
        var users = await res.json();
        console.log('[Test] Received', Array.isArray(users) ? users.length : '?', 'users');
        if (Array.isArray(users) && users.length === 10) {
          var names = users.slice(0, 3).map(function(u) { return u.name; }).join(', ');
          sendResult(true, 'GET /users -> ' + res.status + ' (' + users.length + ' users)', names + '...');
        } else {
          sendResult(false, 'GET /users -> unexpected data', 'Expected 10 users, got: ' + (Array.isArray(users) ? users.length : typeof users));
        }
      } catch (err) {
        console.error('[Test] GET /users failed:', err.message);
        sendResult(false, 'GET /users -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 3: POST with JSON body (allowed domain)
    // -------------------------------------------------------
    case 'test-post-json': {
      console.log('[Test] POST /posts to jsonplaceholder');
      try {
        var body = JSON.stringify({
          title: 'Test US-RUN-07',
          body: 'Proxy fetch from Figma plugin sandbox',
          userId: 42
        });
        var res = await fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body
        });
        console.log('[Test] Response status:', res.status, res.statusText);
        var data = await res.json();
        console.log('[Test] Created post:', JSON.stringify(data));
        if (data && data.id) {
          sendResult(true, 'POST /posts -> ' + res.status + ' (id: ' + data.id + ')', 'title: ' + data.title);
        } else {
          sendResult(false, 'POST /posts -> unexpected response', JSON.stringify(data).substring(0, 100));
        }
      } catch (err) {
        console.error('[Test] POST /posts failed:', err.message);
        sendResult(false, 'POST /posts -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 4: GET text response (allowed domain)
    // -------------------------------------------------------
    case 'test-get-text': {
      console.log('[Test] GET /comments/1 as text from jsonplaceholder');
      try {
        var res = await fetch('https://jsonplaceholder.typicode.com/comments/1');
        console.log('[Test] Response status:', res.status);
        var text = await res.text();
        console.log('[Test] Text length:', text.length, 'chars');
        console.log('[Test] Text preview:', text.substring(0, 100));
        if (text.length > 0) {
          sendResult(true, 'GET /comments/1 .text() -> ' + res.status, text.length + ' chars received');
        } else {
          sendResult(false, 'GET /comments/1 .text() -> empty', 'No text content');
        }
      } catch (err) {
        console.error('[Test] GET text failed:', err.message);
        sendResult(false, 'GET /comments/1 .text() -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 5: clone() then read both copies
    // -------------------------------------------------------
    case 'test-clone': {
      console.log('[Test] clone() test on /posts/2');
      try {
        var res = await fetch('https://jsonplaceholder.typicode.com/posts/2');
        console.log('[Test] Cloning response...');
        var cloned = res.clone();
        var textOriginal = await res.text();
        var jsonClone = await cloned.json();
        console.log('[Test] Original .text() length:', textOriginal.length);
        console.log('[Test] Clone .json() id:', jsonClone.id);
        if (textOriginal.length > 0 && jsonClone.id === 2) {
          sendResult(true, 'clone() -> both reads OK', 'text: ' + textOriginal.length + ' chars, json.id: ' + jsonClone.id);
        } else {
          sendResult(false, 'clone() -> unexpected', 'text=' + textOriginal.length + ' json.id=' + jsonClone.id);
        }
      } catch (err) {
        console.error('[Test] clone() failed:', err.message);
        sendResult(false, 'clone() -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 6: BLOCKED domain (google.com)
    // -------------------------------------------------------
    case 'test-blocked-domain': {
      console.log('[Test] GET https://google.com (should be blocked by proxy)');
      try {
        var res = await fetch('https://google.com');
        console.warn('[Test] Unexpected success! Status:', res.status);
        var text = await res.text();
        console.warn('[Test] Response body preview:', text.substring(0, 100));
        sendResult(false, 'google.com -> ' + res.status + ' (should have been blocked!)', 'Proxy did not block this domain');
      } catch (err) {
        console.log('[Test] Correctly blocked:', err.message);
        sendResult(true, 'google.com -> BLOCKED', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 7: BLOCKED domain (example.org)
    // -------------------------------------------------------
    case 'test-blocked-domain-2': {
      console.log('[Test] GET https://example.org (should be blocked by proxy)');
      try {
        var res = await fetch('https://example.org');
        console.warn('[Test] Unexpected success! Status:', res.status);
        var text = await res.text();
        sendResult(false, 'example.org -> ' + res.status + ' (should have been blocked!)', text.substring(0, 80));
      } catch (err) {
        console.log('[Test] Correctly blocked:', err.message);
        sendResult(true, 'example.org -> BLOCKED', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // TEST 8: Query params (allowed domain)
    // -------------------------------------------------------
    case 'test-query-params': {
      console.log('[Test] GET /posts?userId=1 (filtered)');
      try {
        var res = await fetch('https://jsonplaceholder.typicode.com/posts?userId=1');
        var posts = await res.json();
        console.log('[Test] Filtered posts:', Array.isArray(posts) ? posts.length : '?');
        if (Array.isArray(posts) && posts.length === 10) {
          sendResult(true, 'GET /posts?userId=1 -> ' + posts.length + ' posts', 'Filter by userId works');
        } else {
          sendResult(false, 'GET /posts?userId=1 -> unexpected count', 'Got ' + (Array.isArray(posts) ? posts.length : typeof posts));
        }
      } catch (err) {
        console.error('[Test] Query params failed:', err.message);
        sendResult(false, 'GET /posts?userId=1 -> ERROR', err.message);
      }
      break;
    }

    // -------------------------------------------------------
    // RUN ALL TESTS
    // -------------------------------------------------------
    case 'test-run-all': {
      console.log('[Test] === Running all proxy fetch tests ===');
      var tests = [
        'test-get-json',
        'test-get-users',
        'test-post-json',
        'test-get-text',
        'test-clone',
        'test-blocked-domain',
        'test-blocked-domain-2',
        'test-query-params'
      ];
      for (var i = 0; i < tests.length; i++) {
        figma.ui.postMessage({ type: 'status', message: 'Running test ' + (i + 1) + '/' + tests.length + ': ' + tests[i] });
        // Re-dispatch to self
        await new Promise(function(resolve) {
          var handler = figma.ui.onmessage;
          // Send to self by direct call with a wrapped testId
          var testMsg = { type: tests[i], testId: tests[i] };
          // We need to simulate \u2014 just call our own handler
          setTimeout(function() { resolve(); }, 50);
          handler(testMsg);
        });
        // Small delay between tests
        await new Promise(function(resolve) { setTimeout(resolve, 500); });
      }
      console.log('[Test] === All tests complete ===');
      figma.ui.postMessage({ type: 'all-done' });
      break;
    }

    case 'close':
      console.log('[ProxyFetchTester] Closing plugin');
      figma.closePlugin();
      break;
  }
};
`.trim();
