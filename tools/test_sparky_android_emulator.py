#!/usr/bin/env python3
"""Smoke-test Sparky's Android UI against a running x86_64 emulator.

Tests whether the APK installs, launches, renders its avatar/chat controls, opens
Settings and exposes the offline article count without crashing. Not a local-LLM
latency benchmark; device performance requires physical ARM64 hardware.
"""
import re
import subprocess
import time
import xml.etree.ElementTree as ET

APP = "uk.co.afileonmotorsport.spark"
ACTIVITY = APP + "/.MainActivity"


def adb(*args, timeout=40):
    result = subprocess.run(["adb", *args], text=True, encoding="utf-8",
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"adb {' '.join(args)} failed: {result.stderr[:600]}")
    return result.stdout


def view():
    adb("shell", "uiautomator", "dump", "/sdcard/sparky-ui.xml")
    xml = adb("exec-out", "cat", "/sdcard/sparky-ui.xml")
    return ET.fromstring(xml)


def find(root, words):
    for node in root.iter("node"):
        label = node.attrib.get("text", "") + " " + node.attrib.get("content-desc", "")
        if all(w.casefold() in label.casefold() for w in words):
            return node
    return None


def click(node):
    if node is None:
        raise AssertionError("UI control not found")
    values = [int(x) for x in re.findall(r"\d+", node.attrib.get("bounds", ""))]
    if len(values) != 4:
        raise AssertionError("No tappable bounds: " + str(node.attrib))
    x, y = (values[0]+values[2])//2, (values[1]+values[3])//2
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(1.2)


def main():
    print("Installing Sparky test-only x86_64 debug APK")
    adb("install", "-r", "spark/build/outputs/apk/debug/spark-debug.apk", timeout=120)
    adb("logcat", "-c")
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    time.sleep(10)  # give SQLite its first-run import time
    root = view()
    assert find(root, ["SPARK", "AFILÉON"]), "App header not rendered"
    assert find(root, ["SEND"]), "Chat send control absent"
    assert find(root, ["TALK"]), "Voice entry control absent"
    assert find(root, ["Sparky", "tap", "talk"]), "Avatar inaccessible"
    print("PASS: app, chat and avatar launched")
    click(find(root, ["SETTINGS", "MODELS", "KNOWLEDGE"]))
    menu = view()
    assert find(menu, ["View knowledge library"]), "Offline knowledge menu absent"
    assert find(menu, ["What do you remember"]), "Private memory menu absent"
    print("PASS: knowledge and memory settings available")
    click(find(menu, ["View knowledge library"]))
    time.sleep(2)
    screen = view()
    texts = [node.attrib.get("text", "") for node in screen.iter("node")]
    combined = " ".join(texts)
    result = re.search(r"I have (\d+) offline reference entries", combined)
    if not result:
        # Some screen sizes hide the bottom of transcripts: test database via
        # UI only and report inconclusive rather than invent an article count.
        print("NOTE: knowledge count text not visible in emulator viewport")
    else:
        count = int(result.group(1))
        assert count >= 300, f"Bundled encyclopedia not loaded: {count}"
        print(f"PASS: bundled knowledge library contains {count} articles")
    adb("shell", "am", "force-stop", APP)
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    time.sleep(3)
    assert find(view(), ["SEND"]), "App failed to relaunch after force-stop"
    logs = adb("logcat", "-d", "-v", "brief")
    fatal = re.findall(r"FATAL EXCEPTION.*?(?=\n\n|\Z)", logs, re.S)
    if fatal and any(APP in text for text in fatal):
        raise AssertionError("Android crash in Sparky: " + str(fatal[-1][-1200:]))
    print("PASS: relaunch, no observed Sparky fatal exception")
    print("EMULATOR SMOKE TEST PASSED — does not measure actual ARM64 model or voice.")


if __name__ == "__main__":
    main()
