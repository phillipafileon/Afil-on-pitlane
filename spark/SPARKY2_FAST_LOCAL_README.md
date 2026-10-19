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

This is source development, **not** a verified installable APK until CI
and device-level testing pass.
