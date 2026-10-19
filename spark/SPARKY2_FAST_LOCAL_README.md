# SPARKY 2.0 — fast offline local mind (development)

This branch builds on the already unmerged SPARK v0.2 Android test integration.
It does **not** update the public site, production Pitlane app or customer systems.

## Model

**Default candidate:** Qwen3-0.6B Q4_0 GGUF, ~429 MB, Apache-2.0:
https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf

The phone app intentionally does **not** bundle ~429 MB of model weights.
Download the model while connected, then in Sparky tap **IMPORT OFFLINE AI MODEL (GGUF)**.
After import it runs using native `llama.cpp` without an internet connection.

The previous build's native engine loaded GGUF weights again on **every** reply.
The new implementation keeps the model alive between turns, replacing it only on
explicit import. Each message still builds a new context and returns one full
reply (token streaming / GPU acceleration are future performance work).
Qwen3 gets a non-thinking prompt to avoid spending output time on hidden reasoning.
Actual speed depends on the phone/tablet and must be checked on real hardware.

Optional model for **later** evaluation: Qwen3.5-0.8B Q4_0 (~507 MB).
Do not assume its compatibility with the existing pinned llama.cpp runtime,
or that it is faster on older tablets, until it is compiled and benchmarked.

## Personality, memory and character

- A portable, original Character Card V2 personality is bundled as `assets/sparky-character-v2.json` and loaded at startup. The open-format card keeps his identity separate from model weights.
- Original Sparky personality: eccentric, composed, sometimes dryly funny,
  consistent across turns, but not a fixed joke script.
- Local owner-approved memories: `remember that ...`, `what do you remember`,
  `my memories`, `forget memory 1`.
- Only a few recent conversational turns are added to the prompt to keep
  inference memory/latency low. There is no cloud upload or account-level memory.
- A character-first animated view has eyes, mouth and little hands, and
  distinct thinking/speaking expressions.

## Safety and integration

- Existing signed-app bridge to Pitlane and Booking Manager is unchanged.
- Booking/website changes remain **drafts requiring a logged-in admin approval**.
- The model's words are **never executed** as Android or website commands.
- Existing Pitlane signing certificate must be preserved to use signature-level
  permissions. Never replace it with an unrelated signing key.
- No background hot microphone, automatic website control, customer-data sync,
  offline telemetry coaching or autonomous irreversible actions have been added.

## Validation checklist

1. Compile `:spark:assembleRelease` with the same protected signing config.
2. Install alongside the matching signed Pitlane/Booking Manager development builds.
3. Test Qwen3 GGUF import, two sequential replies, model replacement, airplane mode
   voice/text, memory add/list/delete and app relaunch retention.
4. Compare first vs second generation start-up on the intended Lenovo/phone.
   Record latency, tokens/sec, peak RAM, thermals and whether the model remains loaded.
5. Verify Android signature protection, all booking approval gates and that no
   customer data leaves the phone without an explicit approved integration.

Future open-source modules to evaluate: sherpa-onnx for fully local Android speech/wake-word/voice, and an offline indexed knowledge base for vetted motorsport manuals. Neither is implemented in this version.

This is source development, **not** a verified installable APK until CI
and device-level testing pass.

## Sparky's first offline encyclopedia (in development)

The bundled `sparky-starter-knowledge.json` contains **41 original short entries**
across motorsport, automotive engineering and general reference, with links to
independent sources where possible (e.g. ACO Le Mans results and FIA BoP).

A new on-device SQLite FTS4 library retrieves relevant summaries before the model
answers, without sending any prompt to Wikipedia or the internet. Entries can be
shown with their original source links using `sources for <subject>`.

From the main UI:
- Tap Sparky's face or tap TALK to start the Android on-device recogniser.
- Select **SETTINGS · MODELS · KNOWLEDGE** for model and JSON knowledge-pack imports.
- Ask **knowledge status** for the number of available offline entries.
- Say `teach me about <topic>: <fact>` to add an explicit owner-taught, **unverified**
  reference (it does not automatically become factually verified).
- Say `remember that ...` for personal preferences; `my memories` and
  `forget memory 1` control that independent memory store.
- In settings, tap the feedback options to make small, bounded changes to Sparky's
  response style over time. This is **not** fine-tuning or weight training.
- No live Wikipedia requests occur from the app.

### Optional Wikipedia introductions

A maintainer may use `tools/build_sparky_wikipedia_pack.py` on a connected
development computer, with a valid descriptive User-Agent, to extract introductory
text for the 281 curated titles in `tools/sparky_wikipedia_topics.txt`. It
preserves page/source links and credits Wikipedia contributors under CC BY-SA 4.0.
Import the resulting JSON from Settings. Imported text may be truncated; cite its
original page and mark changes. This builder was added to the repository but is
**not** run automatically and no Wikipedia pack is bundled in the APK.

The whole English Wikipedia introductions collection is many gigabytes, so a
full-size offline repository will require a ZIM/SQLite index adapter and a separately
downloaded archive. Kiwix's Wikipedia `mini` edition is the closest practical
ready-made source, but the APK does **not currently read .zim files**.

### What is still missing

The avatar is now tappable, blinks and has basic speaking/thinking animation, but
detailed gestures, accurate lip-sync, continuous listening and full device control
are future stages. The factual library is not yet comprehensive; an AI can still
make mistakes. Online sync between Sparky phone/tablet instances is not implemented.
