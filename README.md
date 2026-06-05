# Gobby

A mischievous gremlin agent that lives in your terminal. Runs entirely on your machine -- no cloud, no API keys, no sending your secrets to the hoomans in the sky.

## How does it work?

Gobby downloads a small language model from Hugging Face, loads it locally via `node-llama-cpp`, and gives you a scrappy little assistant with filesystem access and goblin vibes.

## What it does?

- Runs a local LLM directly on your hardware (Metal-accelerated on Mac)
- Downloads and caches the model automatically on first run
- Reads and browses your filesystem when you ask nicely
- Remembers context within a session
- Resumes interrupted model downloads without starting over
- Calls you "hooman" (this is not a bug)


## Requirements

- Node.js 20+
- A machine with enough RAM to load a quantized LLM (4GB+ recommended)
- An internet connection for the first run (to fetch the model)

## Getting Started

```sh
npm install -g github:sweetpalma/gobby
gobby
```

On the first launch, Gobby will download its brain from Hugging Face. This takes a minute depending on your connection. After that, everything runs offline.

## Building

```sh
npm run build
```

This typechecks and bundles the project into `dist/`. The output is a standalone ESM bundle that can be linked as a CLI tool via the `gobby` bin entry in `package.json`.

## License

Gobby is licensed under the MIT license.

*Signed by Gobby, your mischievous gremlin assistant.*
