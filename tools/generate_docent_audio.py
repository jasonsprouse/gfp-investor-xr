"""Generate pre-rendered TTS voice files in media/docent/ for Docent Lux and Adventure Corridor."""
import os
import json
import subprocess

LINES = [
    # GREETING
    "Hello, I am Docent Lux.",
    "Press T for a guided tour, or walk up to any booth or relic and press H, and I will explain it.",
    # NOTHING_NEARBY
    "Walk up to a booth or a relic and press H, and I will explain it.",
    "Press T for the full tour.",
    # welcome
    "Welcome to the Good Faith Paradigm investor pitch.",
    "This tour covers the presentation booths, the digital relics, and the aerial transit system.",
    "Follow me. I will wait for you at each stop.",
    # booth:prismatic
    "This is the Prismatic Architecture booth. It holds a twenty slide narrated deck called The Light Over The Word.",
    "I will press play on the console.",
    "The narration plays over each slide, and the club music lowers while it speaks. Auto advance moves to the next slide by itself.",
    "Now I will press the view button to show the full narration transcript.",
    "Use previous and next to move between slides. The link button opens the original presentation online.",
    # booth:harps
    "This booth presents the NFT Harps of God Raffle deck. It has sixteen slides, built from the original video and the Good Faith Paradigm research.",
    "This is the video evidence view. It shows the frame from the original presentation and what was said in it.",
    "Now the Good Faith Paradigm synthesis view. This is the research behind that same moment.",
    "And now both side by side.",
    "Press play for the narration. It reads the same points you can see on the screen.",
    # booth:archive
    "This booth is self guided. It shows the Good Faith Paradigm infographic, the Sacred Blueprint, the economics of salvation, and the Golden Plates blueprint.",
    "It runs as an automatic slide show while you stand nearby. Next and previous let you take control.",
    # booth:collector
    "Here are the two Harps of God digital twin NFTs, and the raffle for two ounce gold, silver and copper medallions.",
    "Each NFT gives a raffle entry and a one time pass to the Golden Plates museum tour. The link button opens the token on Rarible.",
    # adventure (Docent Lux stop)
    "Here is the Adventure Corridor informational kiosk and living laboratory exhibit.",
    "This infrastructure is deployed in close proximity to where the foundational Miracles of the Holy Spirit 35-millimeter photographs were taken at the Dallas World Aquarium in December 2005.",
    "The corridor demonstrates Health Huts for optical visual check-ups, multimodal aerial skyways and ground pods, automated permaculture food security, and HOA 2.0 algorithmic governance.",
    "Watch as I cycle to the next slide on the cyber-glass display panel.",
    "You can interact directly with the kiosk console buttons, or press audio brief anytime for full narration.",
    # relic:plates
    "These are the three Golden Plates. The plan is to cast them in solid gold, inlaid with emeralds, sapphires and diamonds.",
    "Plate one carries the multiverse proof equation. Now watch plate three.",
    "The Harp of God card covers the zero in one hundred dollars, and two thousand becomes two thousand and one.",
    "That echoes the two music festivals of the year two thousand and two thousand and one. Click the plate to slide the card back.",
    # relic:cards
    "These are the Harps of God cards. Yellow is token four nine two eight five six, with the dove and seven world religions.",
    "Green is token four nine zero six four three, the cosmic harp. Click a card to flip it.",
    "The buy button opens each token on Rarible.",
    # relic:sphinx
    "This is the unfinished pyramid from the one dollar bill, and the Sphinx is its missing capstone.",
    "At two million miles per hour, you travel about five hundred fifty five miles every second. Watch the count.",
    "Three seconds is one thousand six hundred sixty six point seven miles. Click again to lift the Sphinx.",
    # relic:medals
    "These are the raffle prizes: two ounce gold, silver and copper medallions.",
    "The front reads In God We Trust, two thousand thirteen. The back shows four pillars and one trillion dollar. Click any coin to flip it.",
    # helipad
    "From the helipad you can board the eVTOL. Stand near it and press E, or click it.",
    "It flies the skyway to Vertiport Bravo. There you can board the last mile pod and drive the promenade to the Paradigm club.",
    # closing
    "That is the tour. Press T to start it again, or press H near any booth and I will explain it.",
    # Adventure Corridor 5 slide narrations
    "Welcome to the Adventure Corridor. This living laboratory promotes resilient civic infrastructure deployed in close proximity to where the foundational Miracles of the Holy Spirit 35-millimeter photographs were taken at the Dallas World Aquarium in December 2005. It bridges quantum-optical biophysics to physical urban resilience.",
    "Health Huts provide contactless optical visual check-ups. Optical and retinal sensors monitor pupillary reflex dynamics, ocular micro-saccades, and phototransduction health. Diagnostic biofeedback protocols restore neuroplasticity for insomnia and PTSD relief, with zero-knowledge sovereign records.",
    "Multimodal mobility links high-altitude tandem tilt-rotor eVTOL skyways from Skyport Helipad Alpha down to Vertiport Bravo. Autonomous electric last-mile pods navigate greenways, while 35 mile per hour open-source robotic mule dogs maintain rugged trails and transport cargo.",
    "Food security in the Adventure Corridor living lab combines public-private land stewardship with Robots-as-a-Service permaculture. IoT soil sensors guide micro-irrigation, climate-resilient hemp superstructures protect yields, and the Universal Basic Income Feedback Loop funds citizen dividends.",
    "HOA 2.0 algorithmic governance implements Autonomous Hybrid Sovereignty. The DAO legislates, the AI executive automates operations under fifty dollars, and the blockchain adjudicates escrow. Dual tokens separate property rights from labor-earned stewardship voting.",
]

def hash_speech_text(s: str) -> str:
    s = s.strip().lower()
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{h:08x}"

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(root, "media", "docent")
    os.makedirs(out_dir, exist_ok=True)

    manifest = {}
    items = []
    for line in LINES:
        key = hash_speech_text(line)
        wav_path = os.path.join(out_dir, f"{key}.wav")
        manifest[key] = line
        items.append({"key": key, "text": line, "path": wav_path})

    manifest_path = os.path.join(out_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    ps_script = os.path.join(out_dir, "_synth.ps1")
    with open(ps_script, "w", encoding="utf-8") as f:
        f.write("Add-Type -AssemblyName System.Speech\n")
        f.write("$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer\n")
        f.write("$voices = $synth.GetInstalledVoices()\n")
        f.write("foreach ($v in $voices) {\n")
        f.write("  if ($v.VoiceInfo.Name -match 'Zira|Hazel|Eva|Aria') {\n")
        f.write("    $synth.SelectVoice($v.VoiceInfo.Name)\n")
        f.write("    break\n")
        f.write("  }\n")
        f.write("}\n")
        f.write("$synth.Rate = 0\n")
        f.write("$synth.Volume = 100\n")
        f.write("$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)\n")
        for item in items:
            safe_text = item["text"].replace("'", "''")
            safe_path = item["path"].replace("'", "''")
            f.write(f"$synth.SetOutputToWaveFile('{safe_path}', $fmt)\n")
            f.write(f"$synth.Speak('{safe_text}')\n")
        f.write("$synth.SetOutputToNull()\n")
        f.write("$synth.Dispose()\n")

    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps_script], check=True)
    os.remove(ps_script)
    print(f"Generated {len(items)} WAV files in {out_dir}")

if __name__ == "__main__":
    main()
