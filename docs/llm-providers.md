# LLM providers

neuraldoc needs two services for your own projects:

- **Jev** (`TYPESAFE_API_KEY`) maps documents to the changed code. It is required and stays an external API, even with a local LLM.
- **One LLM** drafts the text changes. You choose the provider.

Set the variables in `.env` and pass it with `docker run --env-file .env`, or put them into `frontend/.env.local` when running without Docker. Never use a `VITE_` prefix for keys: those values end up in the browser bundle. The **Architektur** page in the app shows whether Jev and the LLM are configured (configuration only, no paid connection test). The status API `/api/mcp/setup` only reports whether keys are present.

## Providers

| Provider | `NEURALDOC_DRAFT_PROVIDER` | Key / server | Example model |
| --- | --- | --- | --- |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` |
| Claude | `anthropic` (alias `claude`) | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` |
| Local | `local` | `NEURALDOC_LLM_BASE_URL`, optionally `NEURALDOC_LLM_API_KEY` | `qwen2.5:7b` |
| Gemini | `gemini` | `GEMINI_API_KEY` | `gemini-3.5-flash-lite` |
| Vertex AI | `vertex` | `VERTEX_API_KEY`, `GOOGLE_CLOUD_PROJECT`, location and mode | `gemini-3.5-flash-lite` |

`NEURALDOC_LLM_MODEL` selects the model. The older Gemini setting `NEURALDOC_GEMINI_MODEL` still works. For Google, the Flash-Lite models are enabled; for OpenAI and Claude the chosen model must support structured JSON output. There is no automatic fallback to another provider. The full Vertex setup is described in [mcp/DRAFTING.md](../mcp/DRAFTING.md).

## Local models

Local models use an OpenAI-compatible `/v1` URL:

| Server | Without Docker | From inside Docker |
| --- | --- | --- |
| Ollama | `http://127.0.0.1:11434/v1` | `http://host.docker.internal:11434/v1` |
| LM Studio | `http://127.0.0.1:1234/v1` | `http://host.docker.internal:1234/v1` |

On Linux, start the container with `--add-host host.docker.internal:host-gateway`. The model must be loaded on that server first. If the server does not support JSON schema, set `NEURALDOC_LLM_FORMAT=json_object`. Check model quality and output reliability with your own sources before relying on it.

## Validation

Every response is validated locally: the JSON contract, the text operation and every referenced evidence ID. Aborted, refused or invalid responses are never stored as drafts. Provider, model and local endpoint are part of the cache key; keys are never stored in caches.

API contracts: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility).

## Costs

- **Jev:** capped per mapping run by `NEURALDOC_JEV_BUDGET_USD` (default 0.25 USD, at most 1 USD). Unchanged requests come from the local cache.
- **LLM:** costs of cloud providers are unknown until you set rates: `NEURALDOC_LLM_INPUT_USD_PER_MILLION` and `NEURALDOC_LLM_OUTPUT_USD_PER_MILLION`. For a local LLM, only API fees are reported (0 USD); power and hardware are not included.
- Page views, the showcase and builds never call a model.
