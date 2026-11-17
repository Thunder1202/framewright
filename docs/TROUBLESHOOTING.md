# When something goes wrong

Find the message or problem you see, then follow the steps.

## Captions

**“The captions engine is not installed yet”**
Kadr's Python copy is missing from `kadr\.venv`. Double-click the **Kadr captions** icon once and let it install (a few minutes, needs internet once). Then try **Write captions** again.

**“The captions engine is not running”** (only in the browser version)
The browser version cannot start Kadr itself. Double-click the **Kadr captions** icon, wait for its page to open, then try again. The desktop app starts it for you.

**“The captions engine did not start in time” / “stopped while starting”**
Something else may be using port 8000. Close other programs that run local servers, or change `"port"` in `kadr\settings.json` to another number such as 8010, then reopen Framewright. To see the real error, start Kadr with the **Kadr captions** icon: the black window prints it.

**It takes a long time the first time**
The speech model downloads once, about 1 GB for Uzbek. After that it is quick.

**“Select a video clip that has speech in it”**
Captions work on video clips. For a sound-only clip, put the original video on the timeline instead.

**“Make captions first, then reverse or speed-shape the clip”**
Turn off **Play backwards** and set **Speed shape** to None, write the captions, then turn them back on.

**The video is longer than 5 minutes**
Kadr refuses longer videos. Split the clip into parts under 5 minutes and caption each part. To change the limit, edit `"max_video_seconds"` in `kadr\settings.json`.

**Wrong words, wrong language, or words that nobody said**
This is normal for speech recognition, especially with:
- names and numbers;
- music in the background;
- one sentence that mixes two languages.

Read the captions through and fix them in the right panel: **Text**. Choose the exact language instead of Auto when the whole video is in one language. Words that are always wrong can go into `kadr\dictionary.txt` ([how](../kadr/GUIDE.md)).

**The yellow word stopped lighting up**
You changed the words of that caption, so the word timings no longer fit. It still shows; only the highlight is off. Undo the edit to get it back, or leave it.

## The app

**The desktop icon does nothing or says the file is missing**
The folder `the Framewright folder` was moved or renamed, or `release\win-unpacked` was deleted. Put the folder back, or ask an AI helper to rebuild the app (`npm run dist`) and fix the icon.

**My projects are gone**
Check that `the Framewright folder\data` exists. If you have a backup, close Framewright and copy it back ([how](YOUR-FILES.md)). A spare copy from before the move to D is in `the old app-data folder`.

**“…source files are missing from storage. Re-import to relink.”**
The project remembers a file whose stored copy is gone. Import the same file again.

**Export says the browser cannot encode video**
Use the desktop app, or a current Chrome or Edge.

**The picture in the preview stutters**
The preview drops frames to stay in time; the exported file does not. Very large 4K files are heavy: lowering the canvas size while editing helps.

**Reversed clips have no sound in the preview**
Known limit. The exported file does have the reversed sound.

## For an AI helper fixing things

- **“EBUSY: resource busy or locked” when building:** Framewright is open. Ask the owner to close it, never force it closed.
- **Kadr's `pip.exe` fails:** the virtual environment moved from C to D, so its launchers point at the old place. Use `kadr\.venv\Scripts\python.exe -m pip` instead.
- **More:** [CLAUDE.md](../CLAUDE.md) has the commands, rules and how to check changes.
