#!/usr/bin/env python3
"""Fail the Android build if the SPARKY APK is incomplete or incorrectly signed.

This is packaging QA, *not* an on-device test of voice, model inference, UI or speed.
Run: python tools/qa_sparky_apk.py spark/build/outputs/apk/release/spark-release.apk
"""
import hashlib
import json
import pathlib
import struct
import sys
import zipfile

EXPECTED_SIGNER = "3ecf73f03717fdbe6e7adae2f959541526c18b5d736c385d2b3a1261d51655af"
REQUIRED = {
    "classes.dex",
    "assets/sparky-character-v2.json",
    "assets/sparky-starter-knowledge.json",
    "assets/OPEN_SOURCE_NOTICES.txt",
    "lib/arm64-v8a/libllama.so",
    "lib/arm64-v8a/libggml.so",
    "lib/arm64-v8a/libggml-base.so",
    "lib/arm64-v8a/libggml-cpu.so",
    "lib/arm64-v8a/libspark_llama.so",
}

def length_prefixed(data, offset):
    length = struct.unpack_from("<I", data, offset)[0]
    start = offset + 4
    end = start + length
    if end > len(data):
        raise ValueError("Malformed APK signing block")
    return data[start:end], end

def signer_fingerprint(data):
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("APK ZIP footer missing")
    central = struct.unpack_from("<I", data, eocd + 16)[0]
    if data[central-16:central] != b"APK Sig Block 42":
        raise ValueError("APK v2/v3 signing block missing")
    size = struct.unpack_from("<Q", data, central - 24)[0]
    begin = central - (size + 8)
    if begin < 0 or struct.unpack_from("<Q", data, begin)[0] != size:
        raise ValueError("APK signature block length mismatch")
    pos = begin + 8
    end = central - 24
    signatures = {}
    while pos < end:
        pair_len = struct.unpack_from("<Q", data, pos)[0]
        pos += 8
        pair_id = struct.unpack_from("<I", data, pos)[0]
        pos += 4
        signatures[pair_id] = data[pos:pos+pair_len-4]
        pos += pair_len-4
    for pair_id in (0x7109871a, 0xf05368c0, 0x1b93ad61):
        if pair_id not in signatures:
            continue
        signers, _ = length_prefixed(signatures[pair_id], 0)
        signer, _ = length_prefixed(signers, 0)
        signed_data, _ = length_prefixed(signer, 0)
        _, offset = length_prefixed(signed_data, 0)
        certificates, _ = length_prefixed(signed_data, offset)
        cert, _ = length_prefixed(certificates, 0)
        return hashlib.sha256(cert).hexdigest()
    raise ValueError("No signer's X.509 certificate found")

def run(apk):
    with zipfile.ZipFile(apk) as archive:
        bad = archive.testzip()
        if bad is not None:
            raise ValueError(f"Corrupt archive member: {bad}")
        names = set(archive.namelist())
        missing = REQUIRED - names
        if missing:
            raise ValueError("Missing essential APK files: " + ", ".join(sorted(missing)))
        if any(name.endswith(".gguf") for name in names):
            raise ValueError("The large GGUF model must remain an optional separate import")
        notices = archive.read("assets/OPEN_SOURCE_NOTICES.txt").decode("utf-8")
        if "MIT License" not in notices or "Copyright" not in notices:
            raise ValueError("Missing mandatory open-source license notice")
        character = json.loads(archive.read("assets/sparky-character-v2.json"))
        if character.get("spec") != "chara_card_v2":
            raise ValueError("Sparky personality card missing or invalid")
        if not character.get("data", {}).get("personality"):
            raise ValueError("Sparky personality text missing")
        pack = json.loads(archive.read("assets/sparky-starter-knowledge.json"))
        facts = pack.get("entries", [])
        if pack.get("version") != 1 or len(facts) < 40:
            raise ValueError("Offline encyclopedia was not included")
        titles = {x.get("title", "") for x in facts}
        for title in ("Porsche 924", "1979 24 Hours of Le Mans", "GT3 racing", "Electricity"):
            if title not in titles:
                raise ValueError("Important reference absent: " + title)
        for fact in facts:
            if not fact.get("title") or not fact.get("summary"):
                raise ValueError("Empty article heading/body")
            src = fact.get("source", "")
            if src and not src.startswith("https://"):
                raise ValueError("Untrusted article source URL")
        # App's DEX must contain the real compiled knowledge/memory classes.
        dex = archive.read("classes.dex")
        for label in (b"SparkyKnowledge", b"SparkyMind", b"SparkyFaceView", b"LocalLlama"):
            if label not in dex:
                raise ValueError("Compiled Sparky component missing: " + repr(label))
    fingerprint = signer_fingerprint(apk.read_bytes())
    if fingerprint != EXPECTED_SIGNER:
        raise ValueError("Unexpected APK certificate. Refusing incompatible update.")
    print("SPARKY APK QA PASSED: ZIP, signer, model engine, avatar, memory, knowledge pack")
    print("Articles:", len(facts), "Signer SHA-256:", fingerprint)
    print("STILL REQUIRED: model import, first/second reply timing, voice, animations,")
    print("offline mode, signed Pitlane bridge and data retention on an Android device.")

if __name__ == "__main__":
    try:
        run(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "spark/build/outputs/apk/release/spark-release.apk"))
    except Exception as exc:
        raise SystemExit(f"SPARKY APK QA FAILED: {exc}")
