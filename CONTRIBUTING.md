# Contributing to neuraldoc

Thanks for your interest. Bug reports, worked examples and focused pull requests are all welcome.

## Development setup

You need Git and Node.js 24. Docker is only needed to test the image.

```bash
git clone --recursive https://github.com/neuraldoc-ai/neuraldoc-app.git
cd neuraldoc-app/frontend
npm ci
npm run dev        # http://localhost:5174/app/
```

On Windows, clone with `git -c core.autocrlf=false clone --recursive …` so the sample code keeps its line endings. If you cloned without `--recursive`, run `git submodule update --init`.

## Checks

Run these in `frontend/` before you open a pull request. CI runs the same commands.

```bash
npm test           # backend tests; Jev and LLMs are mocked, nothing is billed
npm run build      # type check and production build
npm run lint
docker build -t neuraldoc ..   # optional: the image
```

Tests must never call a paid API. Use the injection options of the Jev client and the draft generator, as the existing tests in `mcp/*.test.mjs` do. Real provider runs (`npm run brain:map`, `npm run brain:evaluate`) are manual and cost money.

## Guidelines

- **One interface.** Showcase and own projects share all pages. Branch on the active dataset instead of copying a page.
- **UI text in German, code and documentation in English.**
- **Use the existing shadcn/ui components** in `frontend/src/dashboard/components/ui`.
- **Evidence before claims.** Anything shown as a fact must come from the code, the data or a validated model answer. Derived links stay marked as derived.
- **No secrets in the repository**, and no keys with a `VITE_` prefix.
- **Keep changes small.** One topic per pull request, with tests for new behaviour.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: keep import paths case-insensitive on Windows`.

## What helps most

- **Worked examples.** Run neuraldoc on a real (or public) repository and documentation, and describe in an issue what it found, what it missed and what it invented.
- **Bug reports** with the steps, the expected and the actual result, the browser console or container log (`docker logs <container>`) and, for import problems, the warnings shown after the import.
- **New languages** for the code graph, see [ARCHITECTURE.md](ARCHITECTURE.md#adding-a-language).

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make your change and run the checks above.
3. Open a pull request that explains what changes and why, and how you tested it.

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
