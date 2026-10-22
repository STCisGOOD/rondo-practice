// node --test test/rondo-practice.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../rondo-practice.js', import.meta.url), 'utf8')
const PACK = {
  schema: 'rondo.practice-pack.v1',
  project: 'Workshop',
  info: { ok: true, name: 'Rondo local API', version: 1, project: 'Workshop' },
  library: [{ file: 'frankenstein.txt', title: 'Frankenstein' }],
  ask: [
    { question: 'Who was Ada Lovelace?', response: { ok: true, mode: 'rondo', path: 'grounded', project: 'Workshop', answer: 'Ada Lovelace wrote the first published program [D:aa11].', evidence: [{ tag: '[D:aa11]', quote: 'q', file: 'wikipedia-ada-lovelace.txt', passage: 1 }], feedback_token: null } },
    { question: 'How did the Mechanical Turk work?', response: { ok: true, mode: 'rondo', path: 'grounded', project: 'Workshop', answer: 'A hidden chess master operated it [D:bb22].', evidence: [], feedback_token: null } },
  ],
  model: [{ question: 'Who was Ada Lovelace?', response: { ok: true, mode: 'model', answer: 'A mathematician.', model: 'qwen3-4b-q4km', from_your_files: false } }],
  search: [{ query: 'chess', response: { ok: true, query: 'chess', project: 'Workshop', results: [{ id: 'n1', subject: 'the Turk', relation: 'played', object: 'chess', quote: 'it played chess', file: 'wikipedia-mechanical-turk.txt' }] } }],
}

function page ({ search = '' } = {}) {
  const sent = []
  const realFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    sent.push(url)
    if (url.endsWith('practice-pack.json')) return new Response(JSON.stringify(PACK), { status: 200, headers: { 'Content-Type': 'application/json' } })
    return new Response('{"real":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const window = { fetch: realFetch, location: { search } }
  const document = { currentScript: { src: 'https://kit.example/rondo-practice.js', dataset: {} } }
  const context = vm.createContext({ window, document, URL, Response, Request, setTimeout, Promise, JSON, Math, Date, Set, Object, Array, String, Number, Error })
  vm.runInContext(SOURCE, context)
  window.RondoPractice.delay = 0
  return { window, sent }
}

test('a question is answered from the closest recorded one, in the real /ask shape', async () => {
  const { window, sent } = page()
  const r = await window.fetch('http://localhost:7778/ask', { method: 'POST', body: JSON.stringify({ question: 'who was ada lovelace' }) })
  const body = await r.json()
  assert.equal(r.status, 200)
  assert.equal(body.ok, true)
  assert.match(body.answer, /Ada Lovelace/)
  assert.equal(body.matched_question, 'Who was Ada Lovelace?')
  assert.equal(body.practice, true)
  assert.equal(body.evidence[0].file, 'wikipedia-ada-lovelace.txt')
  assert.ok(sent.every((url) => !url.startsWith('http://localhost')), 'nothing reaches localhost in practice mode')
})

test("nn.prompt's generic request gets the OpenAI chat shape, any model name but rondo-model answering from files", async () => {
  const { window } = page()
  const nick = { model: 'gemma4:e2b', messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'How did the Mechanical Turk work?' }] }
  const r = await window.fetch('http://localhost:7778/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nick) })
  const body = await r.json()
  assert.equal(body.object, 'chat.completion')
  assert.equal(body.model, 'rondo')
  assert.equal(body.choices[0].message.content, 'A hidden chess master operated it [D:bb22].')
  assert.equal(body.rondo.matched_question, 'How did the Mechanical Turk work?')
  const model = await (await window.fetch('http://127.0.0.1:7778/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'rondo-model', messages: [{ role: 'user', content: 'Who was Ada Lovelace?' }] }) })).json()
  assert.equal(model.model, 'rondo-model')
  assert.equal(model.choices[0].message.content, 'A mathematician.')
})

test('a question with no close match says what the pack can answer', async () => {
  const { window } = page()
  const body = await (await window.fetch('http://localhost:7778/ask', { method: 'POST', body: '{"question":"What is the capital of Peru?"}' })).json()
  assert.equal(body.ok, false)
  assert.equal(body.detail, 'practice_no_match')
  assert.deepEqual(body.suggestions, ['Who was Ada Lovelace?', 'How did the Mechanical Turk work?'])
  const chat = await (await window.fetch('http://localhost:7778/v1/chat/completions', { method: 'POST', body: '{"messages":[{"role":"user","content":"capital of Peru?"}]}' })).json()
  assert.match(chat.choices[0].message.content, /Practice mode has recorded answers/)
})

test('search, info, models and feedback answer like a real Rondo; bad requests are refused like one', async () => {
  const { window } = page()
  const search = await (await window.fetch('http://localhost:7778/search?q=chess')).json()
  assert.equal(search.results[0].file, 'wikipedia-mechanical-turk.txt')
  const loose = await (await window.fetch('http://localhost:7778/search?q=who%20played%20chess%20there')).json()
  assert.equal(loose.results.length, 1, 'no recorded query matches closely, so recorded results are filtered by word')
  assert.equal((await (await window.fetch('http://localhost:7778/')).json()).project, 'Workshop')
  assert.equal((await (await window.fetch('http://localhost:7778/v1/models')).json()).data.length, 2)
  assert.equal((await window.fetch('http://localhost:7778/ask', { method: 'POST', body: '{}' })).status, 400)
  assert.equal((await window.fetch('http://localhost:7778/v1/chat/completions', { method: 'POST', body: '{"stream":true,"messages":[{"role":"user","content":"x"}]}' })).status, 400)
  assert.equal((await window.fetch('http://localhost:7778/graph')).status, 404)
})

test('every answer from the files can be rated, and the rating says what a real Rondo would tell', async () => {
  const { window } = page()
  const ask = async (question, path = '/ask') => (await window.fetch('http://localhost:7778' + path, { method: 'POST', body: JSON.stringify({ question }) })).json()
  const first = await ask('Who was Ada Lovelace?')
  const second = await ask('How did the Mechanical Turk work?')
  assert.ok(first.feedback_token && second.feedback_token && first.feedback_token !== second.feedback_token, 'each answer its own token')
  assert.equal(first.learns_from_feedback, false)
  assert.equal((await ask('Who was Ada Lovelace?', '/ask-model')).feedback_token, undefined, 'the model alone has nothing to rate')
  assert.equal((await ask('What is the capital of Peru?')).feedback_token, undefined, 'nor does a refusal')
  const rate = (body) => window.fetch('http://localhost:7778/feedback', { method: 'POST', body: JSON.stringify(body) })
  const rated = await (await rate({ token: first.feedback_token, correct: false })).json()
  assert.deepEqual([rated.ok, rated.correct, rated.learned, rated.why], [true, false, false, 'practice'])
  assert.match(rated.message, /Practice mode/)
  assert.equal((await rate({ correct: true })).status, 400, 'a token is needed')
  assert.equal((await rate({ token: first.feedback_token })).status, 400, 'and right or wrong')
})

test('other sites are untouched, and live mode sends Rondo calls to the real Rondo', async () => {
  const { window, sent } = page()
  assert.deepEqual(await (await window.fetch('https://example.org/data.json')).json(), { real: true })
  window.RondoPractice.live = true
  assert.deepEqual(await (await window.fetch('http://localhost:7778/ask', { method: 'POST', body: '{"question":"x"}' })).json(), { real: true })
  assert.ok(sent.includes('http://localhost:7778/ask'))
  const fromUrl = page({ search: '?rondo=live' })
  assert.equal(fromUrl.window.RondoPractice.live, true, '?rondo=live in the page address switches to the real Rondo')
})
