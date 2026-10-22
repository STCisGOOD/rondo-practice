# Rondo practice mode

For **DIY-AI-UI: Coding Your Own Local-AI Interface** (MozFest 2026), a workshop pairing
[netnet.studio](https://netnet.studio) with RONDO, a local AI that answers questions from your own
files, with citations.

Sketches talk to Rondo at `http://localhost:7778`, the same way they would to a Rondo running on
the laptop. Add one line and the sketch works on any laptop with a browser, nothing installed: the
calls are answered from answers recorded from a real Rondo, in exactly the shapes Rondo returns.

```html
<script src="https://cdn.jsdelivr.net/gh/STCisGOOD/rondo-practice@v1/rondo-practice.js"></script>
```

When Rondo is running on your laptop, switch the same sketch to it:

```js
RondoPractice.live = true   // or add ?rondo=live to the page address
```

## Sketches

| Sketch | What it shows |
|---|---|
| [1-hello-world](sketches/1-hello-world.html) | Ask, get an answer, with netnet's `nn.prompt` |
| [2-footnotes](sketches/2-footnotes.html) | Every claim's tag becomes a footnote with the exact words it came from |
| [3-side-by-side](sketches/3-side-by-side.html) | The same question answered from the library and by the AI model alone |
| [4-search-cards](sketches/4-search-cards.html) | No chat box: the claims Rondo found in the files, as cards |

## What Rondo answers

| Call | Send | Get back |
|---|---|---|
| `POST /ask` | `{"question": "..."}` | an answer from the files, with `evidence`: the quoted passages and their files |
| `POST /ask-model` | `{"question": "..."}` | the AI model's own answer, without the files |
| `GET /search?q=words` | | claims found in the files (subject, relation, object, quote, file) |
| `POST /v1/chat/completions` | OpenAI chat request | the same answers in the OpenAI shape (`choices[0].message.content`); model `rondo` or `rondo-model` |
| `POST /feedback` | `{"token": "...", "correct": true}` | right or wrong on an answer (every answer from the files has a `feedback_token`); the reply's `message` says whether Rondo's memory learned from it, and why not when it didn't. In practice mode it never does |

In practice mode, a question is matched to the closest recorded one. A question with no close match
gets a reply listing questions the pack can answer (`await RondoPractice.questions()`).

## The starter library

The recorded answers come from a small library of public-domain texts and Wikipedia articles,
listed with their sources and licenses in `practice-pack.json` (`library`).

## Licenses

- Code and sketches: MIT (see `LICENSE`).
- `practice-pack.json`: CC BY-SA 4.0. The answers quote Wikipedia articles (CC BY-SA 4.0, credited
  in the pack) and public-domain texts.

## Tests

```
node --test test/*.test.mjs
```
