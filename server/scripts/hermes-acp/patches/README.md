# Hermes required client-tool backend patch

Base: [NousResearch/hermes-agent @ 43e566f77eaf01293086eb7cb99a21e240d60634](https://github.com/NousResearch/hermes-agent/tree/43e566f77eaf01293086eb7cb99a21e240d60634), Hermes 0.14.0. This is an Octo-maintained patch, not an upstream release. The upstream source is covered by its [MIT license](https://github.com/NousResearch/hermes-agent/blob/43e566f77eaf01293086eb7cb99a21e240d60634/LICENSE).

`client-tools.patch` changes only:

- `run_agent.py`: required tool backend constructor arguments and dispatch at the single-tool / concurrent entry.
- `agent/tool_executor.py`: dispatch through the required backend before native sequential special cases. Keep native batching and result bookkeeping.
- `acp_adapter/session.py`: explicit backend / ID factory dependencies; configure tools and implicit context before constructing the native Agent.
- `acp_adapter/server.py`: bind ACP client / capabilities / cancellation and propagate failed model outcomes. Avoid duplicate native tool events while the backend emits canonical IDs.
- `hermes_cli/plugins.py`: suppress discovery in the dedicated client-tools process, including lazy discovery.

Two modules under `../upstream/` implement the required-backend contract and ACP callbacks. The normal non-controlled branches remain available upstream; Octo always requires the client backend. The patch does not use the default fail-open plugin middleware.

`manifest.json` also pins the unchanged conversation loop, Agent initializer, runtime helpers and model-tools dispatcher. `runtime_patch.py` applies the diff only to temporary copies and loads the resulting modules in memory. A missing backend, mismatched source or invalid patch aborts startup or fails the tool; there is no native execution fallback.

Upgrade procedure: review the actual call paths in the new Hermes revision, port the patch, regenerate the manifest from the reviewed source, then run the Python and real-process ACP tests from the parent README. Changing a hash alone is not an upgrade.
