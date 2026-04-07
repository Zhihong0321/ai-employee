# Prompt System

This folder is the file-based source of truth for Agentic Core prompts and instructions.

## Purpose

Prompt tuning for this project is expected to happen often.
Because of that:

- prompt authoring should happen in repo files
- prompt changes should be easy to diff in git
- future sessions should not need to hunt through service code to find behavior instructions

## Authoring Rules

- keep one prompt file focused on one responsibility
- prefer Markdown for human-editable instructions
- keep output schemas in nearby JSON files when practical
- do not embed large prompt bodies directly inside service code if they belong here
- keep stable policy separate from runtime context

## Recommended Layout

```text
prompts/
  README.md
  shared/
  system/
  classifiers/
  planners/
  responders/
  extractors/
  manifests/
```

## Intended Runtime Model

- files in this folder are the editable source of truth
- code composes prompt parts from this folder based on manifest files
- runtime context is injected separately from static prompt text
- the app should log which prompt manifest and version hash was used for each LLM call
- prompt changes should be reloadable without full app redeploy

## Hot Swap Expectation

Minor prompt tuning should not require rebuilding or redeploying the whole system.

The intended model is:

- edit prompt files here
- trigger prompt reload or sync
- compute a new prompt version hash
- activate that version
- let the next eligible LLM call use it

Rollback should also be possible to the previous known-good prompt version.

## Current State

The prompt registry foundation is now wired in code for the main planning and reply flows.

Current behavior:

- manifests under `prompts/manifests/` define the prompt packs
- static prompt parts are composed from files in this folder
- compiled prompt versions are synced into `prompt_hub_versions`
- one active version per prompt key can be reloaded and activated without full app redeploy
- LLM call logs include prompt key, manifest name, and version hash metadata

Still expected next:

- migrate any remaining scattered prompt text to manifests as the agent core deepens
- add richer operator workflows around prompt preview and rollback if needed
