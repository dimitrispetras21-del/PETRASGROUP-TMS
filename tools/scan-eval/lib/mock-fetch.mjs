// Offline stand-in for the Worker, for --dry-run and the tests.
// Answers the three things the scan path asks for: reference lists (GET
// facade), the Haiku classifier, and the extraction tool loop. Every request
// is recorded so tests can assert on the exact payloads the app would send.

export function createMockFetch({ refData, extraction, extractionV2 = null, docType = 'CARRIER_ORDER' } = {}) {
  const calls = [];
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

  async function mockFetch(url, init = {}) {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const call = { method: init.method || 'GET', path: u.pathname, search: u.search, hasAuth: /^Bearer .+/.test(headers.authorization || ''), origin: headers.origin || null };
    calls.push(call);
    if (!call.hasAuth) return json({ error: { message: 'Unauthorized' } }, 401);

    if (call.method === 'GET' && u.pathname.startsWith('/v0/')) {
      const table = u.pathname.split('/')[3];
      const recs = table === 'CLIENTS' || /FWKAQ/.test(table) ? refData.clients : refData.locations;
      return json({ records: recs });
    }

    if (call.method === 'POST' && u.pathname === '/v1/ai/messages') {
      const body = JSON.parse(init.body);
      call.body = body;
      // Engine v2: one structured-output call, answered in the schema's shape.
      if (body.output_config?.format) {
        return json({ model: body.model, content: [{ type: 'text', text: JSON.stringify(extractionV2) }], stop_reason: 'end_turn',
          usage: { input_tokens: 900, output_tokens: 450, cache_read_input_tokens: 1500 } });
      }
      if (body.max_tokens === 20) {
        return json({ content: [{ type: 'text', text: docType }], stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 3 } });
      }
      const last = body.messages[body.messages.length - 1];
      const hasToolResult = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
      if (body.tools && !hasToolResult) {
        return json({ content: [{ type: 'tool_use', id: 'toolu_mock1', name: 'search_clients', input: { query: extraction.client_name || 'x' } }],
          stop_reason: 'tool_use', usage: { input_tokens: 5000, output_tokens: 40, cache_creation_input_tokens: 4000 } });
      }
      return json({ content: [{ type: 'text', text: JSON.stringify(extraction) }], stop_reason: 'end_turn',
        usage: { input_tokens: 300, output_tokens: 600, cache_read_input_tokens: 4000 } });
    }
    return json({ error: { message: 'mock: unexpected ' + call.method + ' ' + u.pathname } }, 404);
  }
  mockFetch.calls = calls;
  return mockFetch;
}
