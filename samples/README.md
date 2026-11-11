# samples/ — test videos for the benchmark

## What is here now

| File | What it is |
|---|---|
| `test_ru.mp4` | 21 s of Russian, spoken by the Windows robot voice "Irina" |
| `synthetic1_uz.mp4`, `synthetic2_uz.mp4` | ~20 s of Uzbek each, spoken by Microsoft's robot voices (Madina, Sardor) |
| `synthetic_mixed.mp4` | Uzbek, then Russian, then Uzbek (the three clips above glued together) |

Each video has a `.txt` file with the exact words that are spoken.

**Important:** these are computer voices: clean, slow, no music, no accent, no noise.
Real people are much harder to transcribe. Numbers measured on these files tell you that
the program works and how fast your computer is. They do **not** tell you how accurate
it will be on real Uzbek videos. For that you need your own clips:

## Add 5 of your own videos (15 minutes of work, worth it)

1. Pick 5 short videos (20–60 seconds each) of the kind you will really caption:
   different speakers, at least one with background music, at least one that mixes
   Uzbek and Russian.
2. Copy them into this folder. Name them so the language is at the end of the name:
   - `cafe_uz.mp4` → Uzbek
   - `review_ru.mp4` → Russian
   - `vlog.mp4` (no ending) → language is detected automatically
3. For each video, make a text file with the **same name** and `.txt` at the end
   (`cafe_uz.txt`). Type exactly what is said, word for word. Punctuation and
   capital letters do not matter. Latin or Cyrillic both work. Save as UTF-8
   (Notepad does this by default).
4. Run:

   ```bash
   python benchmark.py samples --models small medium
   ```

5. Read the `WER` column: the share of words the model got wrong. 10% means one wrong
   word in ten. Choose the model with the lowest WER that is fast enough for you and
   put its name into `settings.json` (`"model": "medium"`).

You can delete the synthetic files once you have your own.

## Trying a community Uzbek model

People have published Whisper models trained further on Uzbek. Any model in
"CTranslate2 / faster-whisper" format works by name, for example:

```bash
python benchmark.py samples --models small yuldashev222/whisper-small-uz-v1-ct2
```

See DECISIONS.md for the list that was found and what was (and was not) tested.
