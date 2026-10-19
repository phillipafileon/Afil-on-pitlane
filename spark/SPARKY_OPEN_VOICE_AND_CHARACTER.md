# Sparky Open-Source Voice & Character Integration (Development)

## What is implemented

1. **Voice:** Sparky now follows the Android **system-selected offline TTS engine**
   and first tries its selected voice; it does not choose a network voice.
   In Settings there are **Open Android voice engine settings** and
   **Test my current voice** controls. Existing Android built-in voice remains
   supported as a fallback when compatible.
2. **Character:** Settings now includes **Import Kenney CC0 Robot Pack (.zip)**.
   Import the original pack downloaded from Kenney; the application safely
   extracts four yellow robot PNG poses to private local storage and renders
   the new artwork. No dangerous ZIP paths, code or scripts are extracted.
   Sparky responds visibly to "do a flip", "wave", "nod" and "look surprised".
   The original yellow angular face remains the default if no pack is loaded.
3. Existing offline AI GGUF, memory, knowledge library and permitted
   Pitlane/Booking Manager controls remain separated.

## Third-party open-source components and downloads

**Offline Android TTS runtime (separate app):** VoxSherpa,
https://github.com/CodeBySonu95/VoxSherpa-TTS
and its official release page:
https://github.com/CodeBySonu95/VoxSherpa-TTS/releases

VoxSherpa is licensed GPL-3.0 and uses open-source Sherpa-ONNX
(https://github.com/k2-fsa/sherpa-onnx) for voice synthesis.
Sparky **does not embed, link or redistribute VoxSherpa**. It invokes
the Android speech service interface provided by the phone's selected
TTS engine. Installing VoxSherpa alone does NOT force it to be chosen.

**Natural British English voice:** Piper en_GB-northern_english_male-medium,
https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/northern_english_male/medium
approximately 63 MB of model data plus config, hosted in Piper's
voice collection. Source model card lists underlying dataset
CC BY-SA 4.0. Review voice model card and attribution before redistribution.
VoxSherpa may offer a compatible UK English Piper voice through its
built-in model browser instead of requiring manual download.

**Alternative British English female voice:** en_GB-cori-medium,
https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/cori/medium
model card reports a LibriVox public-domain dataset.

**Character pack:** Kenney Robot Pack (50 PNGs, spritesheets and vectors),
https://kenney.nl/assets/robot-pack
Licensed Creative Commons Zero CC0-1.0
(https://creativecommons.org/publicdomain/zero/1.0/).
Kenney artwork source is FREE, reuse is permitted with no attribution
obligation; credit appreciated. Only yellow character poses are imported.

## On-phone testing

1. Back up relevant app data. Do not uninstall existing Sparky.
2. Install VoxSherpa from its official Android release or Play Store.
3. Install and test an offline UK English voice inside VoxSherpa.
4. Android/Samsung: Settings → General management → Text-to-speech output
   → Preferred engine → VoxSherpa. Select its British English voice.
   The menu location can vary by Samsung/Android version.
5. **Force-stop and reopen Sparky** after changing preferred engine.
6. Sparky → long-press avatar → **Test my current voice**; switch to
   Airplane Mode to verify speech requires no network.
7. Download **Kenney Robot Pack** ZIP from its official site, then
   Sparky → Settings → Import Kenney CC0 Robot Pack (.zip).
8. Say "do a flip", "wave", or "nod" and observe the actual pose.
   Model-generated text cannot trigger privileged device or website controls.

## Limitations

* The new voice comes from a separate open-source Android TTS engine; it is
  **not a built-in embedded Piper synthesizer** yet.
* No full character-rigged 3D model: this is animated imported 2D robot artwork.
* The robot pack's original source must be supplied once by the user; it is not
  bundled in the app APK.
* Android voice service availability, installed voices, recognition and device
  performance must be tested in person; do not claim they work untested.
* The voice UI is not live streaming lip synchronisation; speaking state is
  timed by Android utterance callbacks, and individual syllables are not mapped.
