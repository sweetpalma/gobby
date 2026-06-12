# Gobby

[![npm version](https://badge.fury.io/js/gobby-agent.svg)](https://badge.fury.io/js/gobby-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

```text
 ▄▄ ▄██████▄ ▄▄   Gobby Agent
  ▀███ ██ ███▀    Brain : unsloth/Qwen3.5-4B-GGUF
    ▀██████▀      Memos : 0/4096
```

A mischievous gremlin agent that lives in your terminal. Runs entirely on your machine - no cloud, no API keys, no sending your secrets to the hoomans in the sky.

## Features

- **Completely Local:** Gobby runs entirely on your hardware - no data ever leaves your machine.
- **Agentic Workflow:** Gobby is not just a chatbot - it can explore codebases, write code, run terminal commands, and browse the web autonomously to solve complex tasks.
- **Batteries Included:** Comes with a robust set of tools out of the box - including file system access, shell execution and autonomous web browsing.
- **Persistent Memory:** Gobby automatically remembers your preferences and important project facts across sessions.
- **Highly Optimized:** Gobby is engineered for local performance - it runs a very tiny, but capable model, and unloads it during inactivity to save your RAM.
- **Goblin Vibes:** Gobby calls you "hooman" (this is a feature, not a bug).

## Getting Started

You need **Node.js 20+** and a machine with at least **4GB of RAM** (Apple Silicon Macs run this beautifully).

```bash
npm install -g gobby-agent
gobby
```

On the first launch, Gobby will scavenge Hugging Face for its brain. This takes a minute depending on your connection. After that, everything runs completely offline.

## Local Development

Want to hack on Gobby's brain or add new tools?

```bash
git clone https://github.com/sweetpalma/gobby.git
cd gobby
npm install
npm run chat
```

To build a standalone CLI bundle:

```bash
npm run build
```

## 📜 License

Gobby is open-source under the MIT license.

*Signed by Gobby, your mischievous gremlin assistant.*
