# Gobby Agent

[![npm-badge]][npm-url]
[![ci-badge]][ci-url]
[![license-badge]][license-url]
[![typescript-badge]][typescript-url]

![demo](demo.gif)

Gobby is a tiny agent that never leaves your machine. No clouds, no API keys, no sending your secrets to the hoomans in the sky — just you, a tiny virtual creature, and nothing in between.

**Features:**

- **Zero Config:** NPM install and run. No twelve-step wizards.
- **Completely Local:** No telemetry, no tracking, no corporate bullshit.
- **Runs on Fumes:** Fits comfortably in ~4GB of RAM, and unloads itself when idle.
- **Super Fast:** Boots in under 3s on modern Macs. Blink and it's already listening.

### Zero Configuration

Just install it and run. That's the whole setup.

```bash
npm install -g gobby-agent
gobby
```

On its first launch, Gobby will scavenge the Hugging Face for its brain - a tiny four-billion parameter model that fits comfortably in four gigabytes of RAM. After that one trip, it never needs to leave the house again.

No accounts. No tokens. No configuration wizard asking twelve questions
before you're allowed to say hello. You install it, you run it, it works.

### Completely Local

Your conversations, your files, your code — none of it leaves your machine. Ever. Gobby doesn't phone home. It doesn't have a landline.

Inference runs directly on your hardware. Walk away, and it politely unloads itself from memory, handing your RAM back like a good houseguest. Come back, and it picks right back up — like it never left, because it never went anywhere.

No telemetry. No analytics. No "we take your privacy seriously" blog post that quietly means the opposite. Unplug the network cable and Gobby won't even notice.

### Batteries Included

Gobby is not just a chatbot. It's an agent with (tiny) hands. Out of the box, it can:

- **Read and write:** List directories, read files, write new ones, delete what needs deleting. All scoped to your current working directory, so it can't go digging around in places it shouldn't.

- **Search across your project:** Grep through file contents, find files by glob pattern. It always looks before it leaps — no guessing where things live.

- **Run commands:** Safe, boring commands run on their own. Anything spicier stops and asks first. Anything truly unhinged gets refused outright, no matter how nicely you ask.

- **Browse web:** Fetch a URL, read a page as clean Markdown, chase down docs or a Stack Overflow answer — but only when you tell it to. It won't go wandering off on its own curiosity.

- **Remember things:** Tell it once, and it's remembered next time you open the terminal — no re-explaining your project every session.

- **Learn skills:** Drop a skill into your project and Gobby picks it up automatically — project conventions, workflows, house rules, whatever you teach it. Support for the open [Agent Skills](https://agentskills.io/) standard means skills you write for Gobby work elsewhere too.

### Terminal Friendly

Gobby plays nicely with Unix pipes. Feed it, ask a question, get a plain answer. For example, you can:

```bash
cat README.md | gobby "Summarise this:"
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

Or run tests:

```bash
npm run test
npm run test-e2e
```

Pull requests are always welcome!

## License

Gobby is open-source under the MIT license. Do whatever you want with it, no complaints. You could even turn it into your own little abuse goblin. Please don't do this.

_Signed by Gobby, your mischievous gremlin assistant._

[typescript-badge]: https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg
[typescript-url]: http://www.typescriptlang.org/
[ci-badge]: https://img.shields.io/github/actions/workflow/status/sweetpalma/gobby/main.yml?logo=github&label=CI
[ci-url]: https://github.com/sweetpalma/gobby/actions/workflows/main.yml
[npm-badge]: https://img.shields.io/npm/v/gobby-agent?logo=npm
[npm-url]: https://www.npmjs.com/package/gobby-agent
[license-badge]: https://img.shields.io/npm/l/gobby-agent
[license-url]: https://github.com/sweetpalma/gobby/blob/master/LICENSE
