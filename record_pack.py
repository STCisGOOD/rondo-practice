"""Record a practice pack from a real, running Rondo (the workshop vault, netnet switch on).

usage: record_pack.py <out practice-pack.json> <rondo commit> <library folder>
Asks Rondo's local API at http://127.0.0.1:7778 as netnet.studio would, and writes every reply
exactly as Rondo returned it. Nothing is edited: a refusal is recorded as a refusal.
"""
import json, sys, time, urllib.parse, urllib.request
from pathlib import Path

out, commit, library = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
API = 'http://127.0.0.1:7778'
HEADERS = {'Origin': 'https://netnet.studio', 'Content-Type': 'application/json'}

ASK = [
    'Who was Ada Lovelace?',
    'What did Ada Lovelace write about the Analytical Engine?',
    'Did Ada Lovelace think the Analytical Engine could be creative?',
    'What was the Analytical Engine?',
    'Who designed the Analytical Engine?',
    'What was the Mechanical Turk?',
    'How did the Mechanical Turk work?',
    'Who built the Mechanical Turk?',
    'How did Poe argue that the Chess-Player was not a pure machine?',
    "What does Poe say about the Automaton's movements?",
    'Why did the Erewhonians destroy their machines?',
    'What does Butler think machines might become?',
    'Does the Book of the Machines say machines could become conscious?',
    'Who is Victor Frankenstein?',
    'Why did Victor Frankenstein abandon his creature?',
    'What does the creature want from Victor?',
    'What is a large language model?',
    'How are large language models trained?',
    'What are hallucinations in large language models?',
    'What is user interface design?',
    'What makes a user interface good?',
    'What is free and open-source software?',
    'How do Frankenstein and the Book of the Machines differ in their fears about what humans create?',
    'What do the Mechanical Turk and large language models have in common?',
    'How do Lovelace and Butler imagine machines differently?',
    'What do these texts say about who is responsible for what a machine does?',
]
MODEL = [
    'Who was Ada Lovelace?',
    'What was the Mechanical Turk?',
    'What is a large language model?',
    'What is user interface design?',
    'What is free and open-source software?',
    'Write a short poem about a machine that learns to dream.',
    'Give me three ideas for a strange interface to an AI.',
    'What is the difference between a chatbot and a search engine?',
]
SEARCH = ['Lovelace', 'chess', 'machine', 'creature', 'consciousness', 'interface', 'open source', 'Babbage']


def call(method, path, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers=HEADERS)
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read().decode('utf-8')), time.time() - started
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode('utf-8')), time.time() - started


info, _ = call('GET', '/')
assert info.get('ok') is True, f'Rondo is not answering as netnet: {info}'
pack = {
    'schema': 'rondo.practice-pack.v1',
    'project': info.get('project'),
    'recorded_with': {'rondo_commit': commit, 'recorded_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())},
    'info': info,
    'library': [],
    'ask': [], 'model': [], 'search': [],
}
credits = (library / 'CREDITS.txt').read_text(encoding='utf-8')
for block in credits.split('\n\n')[1:]:
    lines = [l.strip() for l in block.strip().splitlines()]
    if len(lines) >= 3:
        pack['library'].append({'file': lines[0], 'title': lines[1], 'source': lines[2].removeprefix('Source: '),
                                'license': ' '.join(lines[3:])})

for q in ASK:
    reply, seconds = call('POST', '/ask', {'question': q})
    pack['ask'].append({'question': q, 'seconds': round(seconds, 1), 'response': reply})
    print(f'ask   {seconds:5.1f}s ok={reply.get("ok")} {q}', flush=True)
for q in MODEL:
    reply, seconds = call('POST', '/ask-model', {'question': q})
    pack['model'].append({'question': q, 'seconds': round(seconds, 1), 'response': reply})
    print(f'model {seconds:5.1f}s ok={reply.get("ok")} {q}', flush=True)
for q in SEARCH:
    reply, seconds = call('GET', '/search?q=' + urllib.parse.quote(q))
    pack['search'].append({'query': q, 'response': reply})
    print(f'search {len(reply.get("results", []))} results for {q}', flush=True)

out.write_text(json.dumps(pack, indent=1, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
answered = sum(1 for r in pack['ask'] if r['response'].get('ok'))
print(f'wrote {out}: {answered}/{len(ASK)} answered from the files, {len(MODEL)} model-only, {len(SEARCH)} searches')
