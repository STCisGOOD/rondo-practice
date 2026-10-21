/* Rondo practice mode, for netnet.studio sketches (DIY-AI-UI workshop, MozFest 2026).
 *
 * A sketch talks to Rondo at http://localhost:7778, as it would to a real Rondo on the laptop.
 * With this script on the page, those calls are answered from a pack of answers recorded from a
 * real Rondo (practice-pack.json, beside this file), in exactly the shapes a real Rondo returns,
 * so a sketch works on any laptop with a browser and nothing installed. The same sketch then works
 * unchanged against a real Rondo:
 *
 *   RondoPractice.live = true        // in the sketch, or add ?rondo=live to the page address
 *
 * Only calls to http://localhost:7778 or http://127.0.0.1:7778 are touched; every other request
 * goes out as normal. In practice mode nothing is sent to localhost at all.
 *
 * Questions are matched to the closest recorded one by their words. A question with no close
 * match gets a plain reply listing questions the pack can answer (RondoPractice.questions()).
 */
(function () {
  'use strict'
  const here = document.currentScript
  const PACK_URL = (here && here.dataset && here.dataset.pack) ||
    (here && here.src ? new URL('practice-pack.json', here.src).href : 'practice-pack.json')
  const realFetch = window.fetch.bind(window)
  const RONDO = /^http:\/\/(localhost|127\.0\.0\.1):7778(\/|$)/
  const MODEL_ONLY = 'rondo-model'
  const MATCH_FLOOR = 0.3
  const STOP = new Set(('a an and are as at be but by did do does for from has have how i in is it its ' +
    'me my of on or so that the their them there these they this to was were what when where which who ' +
    'whom why will with you your about can could would should into than then').split(' '))

  let pack = null
  const state = {
    live: /[?&]rondo=live\b/.test(String(window.location && window.location.search || '')),
    delay: 700,
  }

  function load () {
    if (!pack) {
      pack = realFetch(PACK_URL).then((r) => {
        if (!r.ok) throw new Error('practice pack ' + r.status)
        return r.json()
      })
    }
    return pack
  }

  function words (text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, ' ')
      .split(/\s+/).filter((w) => w && !STOP.has(w))
  }

  function similarity (a, b) {
    const x = new Set(words(a))
    const y = new Set(words(b))
    if (!x.size || !y.size) return 0
    let both = 0
    for (const w of x) if (y.has(w)) both++
    return both / (x.size + y.size - both)
  }

  function closest (records, key, text) {
    let best = null
    let score = 0
    for (const record of records || []) {
      const s = similarity(text, record[key])
      if (s > score) { best = record; score = s }
    }
    return score >= MATCH_FLOOR ? { record: best, score } : null
  }

  function suggestions (p, n) {
    return (p.ask || []).slice(0, n || 6).map((r) => r.question)
  }

  function noMatch (p, question, mode) {
    const list = suggestions(p, 6)
    return {
      ok: false, mode, question, answer: '', refused: true, practice: true,
      message: 'Practice mode has recorded answers for questions like: ' + list.map((q) => '"' + q + '"').join(', ') +
        '. A real Rondo answers anything about its files.',
      detail: 'practice_no_match',
      suggestions: list,
    }
  }

  function answerFor (p, question, modelOnly) {
    const hit = closest(modelOnly ? p.model : p.ask, 'question', question)
    if (!hit) return noMatch(p, question, modelOnly ? 'model' : 'rondo')
    return Object.assign({}, hit.record.response, {
      question, practice: true, matched_question: hit.record.question,
    })
  }

  function chatShape (body, modelOnly) {
    const ok = body.ok === true
    const created = Math.floor(Date.now() / 1000)
    return {
      id: 'rondo-' + created,
      object: 'chat.completion',
      created,
      model: modelOnly ? MODEL_ONLY : 'rondo',
      choices: [{ index: 0, message: { role: 'assistant', content: ok ? (body.answer || '') : (body.message || 'Rondo could not answer this.') }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      rondo: body,
    }
  }

  function chatQuestion (body) {
    const messages = Array.isArray(body.messages) ? body.messages : []
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m || m.role !== 'user') continue
      if (typeof m.content === 'string') return m.content.trim()
      if (Array.isArray(m.content)) {
        return m.content.filter((part) => (part.type || 'text') === 'text' && typeof part.text === 'string')
          .map((part) => part.text).join('\n').trim()
      }
    }
    return ''
  }

  function searchFor (p, q) {
    const hit = closest(p.search, 'query', q)
    if (hit) return Object.assign({}, hit.record.response, { query: q, practice: true, matched_query: hit.record.query })
    const wanted = new Set(words(q))
    const seen = new Set()
    const results = []
    for (const record of p.search || []) {
      for (const row of (record.response && record.response.results) || []) {
        const text = [row.subject, row.relation, row.object, row.quote].join(' ')
        if (!seen.has(row.id) && words(text).some((w) => wanted.has(w))) { seen.add(row.id); results.push(row) }
      }
    }
    return { ok: true, query: q, project: p.project, results: results.slice(0, 20), practice: true }
  }

  async function readBody (input, init) {
    let raw = init && init.body
    if (raw === undefined && input && typeof input === 'object' && typeof input.text === 'function') raw = await input.clone().text()
    if (raw === undefined || raw === null || raw === '') return null
    if (typeof raw !== 'string') return undefined
    try { return JSON.parse(raw) } catch (e) { return undefined }
  }

  function reply (status, body) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }

  async function practice (input, init, url) {
    const p = await load()
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
    const path = url.pathname
    if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay))
    if (method === 'GET' && path === '/') return reply(200, Object.assign({}, p.info, { practice: true }))
    if (method === 'GET' && path === '/v1/models') {
      return reply(200, { object: 'list', data: [{ id: 'rondo', object: 'model', owned_by: 'rondo' }, { id: MODEL_ONLY, object: 'model', owned_by: 'rondo' }] })
    }
    if (method === 'GET' && path === '/search') {
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return reply(400, { ok: false, error: 'Search with /search?q=your+words' })
      return reply(200, searchFor(p, q))
    }
    if (method === 'POST' && (path === '/ask' || path === '/ask-rondo' || path === '/ask-model')) {
      const body = await readBody(input, init)
      const question = String((body && (body.question || body.q || body.prompt)) || '').trim()
      if (!question) return reply(400, { ok: false, error: 'Send {"question": "..."}' })
      return reply(200, answerFor(p, question, path === '/ask-model'))
    }
    if (method === 'POST' && path === '/v1/chat/completions') {
      const body = await readBody(input, init)
      if (body && body.stream === true) return reply(400, { ok: false, error: { message: 'Rondo answers whole, not streamed: leave out "stream" or send "stream": false', type: 'rondo_error' } })
      const question = body ? chatQuestion(body) : ''
      if (!question) return reply(400, { ok: false, error: { message: 'The messages need a user message with text', type: 'rondo_error' } })
      const modelOnly = String(body.model || '').trim() === MODEL_ONLY
      return reply(200, chatShape(answerFor(p, question, modelOnly), modelOnly))
    }
    if (method === 'POST' && path === '/feedback') {
      return reply(200, { ok: true, recorded: 'practice', learned: false, practice: true })
    }
    return reply(404, { ok: false, error: "Rondo's local API has /, /ask, /ask-rondo, /ask-model, /feedback, /search, /v1/chat/completions and /v1/models" })
  }

  window.fetch = function (input, init) {
    const href = typeof input === 'string' ? input : (input && input.url) || String(input)
    if (state.live || !RONDO.test(href)) return realFetch(input, init)
    return practice(input, init, new URL(href))
  }

  window.RondoPractice = {
    get live () { return state.live },
    set live (on) { state.live = !!on },
    get delay () { return state.delay },
    set delay (ms) { state.delay = Math.max(0, Number(ms) || 0) },
    questions: async () => (await load()).ask.map((r) => r.question),
    library: async () => (await load()).library,
  }
})()
