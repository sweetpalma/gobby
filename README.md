# Gobby

[![npm-badge]][npm-url]
[![ci-badge]][ci-url]
[![license-badge]][license-url]
[![typescript-badge]][typescript-url]

![demo](demo.gif)

Gobby is a blazing fast gremlin agent that never leaves your machine. No clouds, no API keys, no sending your secrets to the hoomans in the sky - just you, a tiny virtual creature, and nothing inbetween.

**Features:**

- **Zero Config:** NPM install and run. No twelve-step wizards.
- **Completely Local:** No telemetry, no tracking, no corporate bullshit.
- **Runs on Fumes:** Fits comfortably in ~4GB of RAM, and unloads itself when idle.
- **Super Fast:** Boots in under 3s on modern Macs.

### Zero Configuration

Just install it and run. That's the whole setup.

```bash
npm install -g gobby-agent
gobby
```

On its first launch, Gobby will scavenge the Hugging Face for its brain - a tiny four-billion parameter model that fits comfortably in ~4GB of RAM. After that, everything runs completely offline.

No accounts. No tokens. No configuration wizard asking you twelve questions before you can say hello. It just works - and _fast_.

### Completely Local

Your conversations, your files, your code - none of it leaves your machine. Ever.

Gobby runs inference directly on your hardware. When you walk away, it unloads the model from memory to give your RAM back. When you come back, it picks up right where you left off - as if it never left.

No telemetry. No analytics. No "we take your privacy seriously" blog post that means the opposite. The network cable could be unplugged and Gobby would not even notice.

### Batteries Included

Gobby is not a chatbot. It's an agent with (tiny) hands. Out of the box, it can:

- **Read and write:** List directories, read files, write new ones, delete what needs deleting. All scoped to your current working directory so it can't wander off.

- **Search across your project:** Grep through file contents, find files by glob pattern. It always looks before it leaps.

- **Run shell commands:** Safe commands like `git status`, `npm test`, and `ls` run automatically. Anything spicy requires your explicit confirmation. Anything truly unhinged (like nuking your hard drive) is hard-blocked.

- **Browse web:** Fetch raw URLs or read web pages as clean Markdown. Documentation, APIs, Stack Overflow - it can go get what it needs, but _only_ when you ask to.

- **Remember things:** Persistent memory across sessions. Tell it your name, your preferences, your project conventions. It writes them down and carries them forward.

### Terminal Friendly

Gobby plays nicely with Unix pipes. Feed it, ask a question, get a plain answer. For example, you can:

```bash
cat src/index.ts | gobby "explain this file"
```

## Local Development

Want to hack on Gobby's brain or teach it new tricks?

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

Pull requests are always welcome!

## License

Gobby is open-source under the MIT license. That means you can do whatever you want - with no complaints. You can even turn it into your own abuse goblin (please, don't do this).

_Signed by Gobby, your mischievous gremlin assistant._

[typescript-badge]: https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg
[typescript-url]: http://www.typescriptlang.org/
[ci-badge]: https://img.shields.io/github/actions/workflow/status/sweetpalma/gobby/main.yml?logo=github&label=CI
[ci-url]: https://github.com/sweetpalma/gobby/actions/workflows/main.yml
[npm-badge]: https://img.shields.io/npm/v/gobby-agent?logo=npm
[npm-url]: https://www.npmjs.com/package/gobby-agent
[license-badge]: https://img.shields.io/npm/l/gobby-agent
[license-url]: https://github.com/sweetpalma/gobby/blob/master/LICENSE
