"""Caption lines: splitting words into short lines, editing them, exporting SRT.

A "line" is what appears on screen at one time:

    {"start": 1.2, "end": 2.9, "text": "Salom, mening ismim",
     "words": [{"word": "Salom,", "start": 1.2, "end": 1.6}, ...]}

All functions here are pure: they take lines and return new lines.
"""
import copy

MIN_WORDS = 2          # try not to show fewer words than this
MAX_WORDS = 6          # never show more words than this
MAX_CHARS = 32         # longest line, counted in characters
MAX_PAUSE = 0.7        # a silence longer than this (seconds) starts a new line
MIN_DURATION = 0.1     # shortest time a line or word may last
SENTENCE_END = (".", "!", "?", "…")


def _line_from_words(words):
    """Build a line dict from a non-empty list of word dicts."""
    return {"start": words[0]["start"], "end": words[-1]["end"],
            "text": " ".join(w["word"] for w in words), "words": words}


def _text_len(words):
    """Number of characters when the words are joined with spaces."""
    return sum(len(w["word"]) for w in words) + max(len(words) - 1, 0)


def _split_segment(words, max_words, max_chars, max_pause):
    """Greedy split of one segment's words into groups (lists of words)."""
    groups = []
    current = []
    for word in words:
        if current:
            too_many = len(current) >= max_words
            too_long = _text_len(current) + 1 + len(word["word"]) > max_chars
            paused = word["start"] - current[-1]["end"] > max_pause
            sentence_done = current[-1]["word"].endswith(SENTENCE_END) and len(current) >= MIN_WORDS
            if too_many or too_long or paused or sentence_done:
                groups.append(current)
                current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def _fix_orphans(groups, max_words, max_chars, strict=False):
    """Remove one-word lines where possible.

    The last line of a segment must never be a single leftover word, so there
    we always repair. In the middle we only repair when the limits allow it.
    strict: the user chose an exact number of words, so never go over it.
    """
    if max_words <= 1:
        return groups
    i = 1
    while i < len(groups):
        if len(groups[i]) != 1:
            i += 1
            continue
        prev, lone = groups[i - 1], groups[i]
        is_last = i == len(groups) - 1
        fits_merged = (len(prev) + 1 <= max_words and _text_len(prev) + 1 + len(lone[0]["word"]) <= max_chars)
        if fits_merged:
            groups[i - 1] = prev + lone             # simply join the two lines
            del groups[i]
        elif len(prev) >= 3 and (is_last or len(prev[-1]["word"]) + 1 + len(lone[0]["word"]) <= max_chars):
            groups[i] = [prev[-1]] + lone           # borrow one word from the line above
            groups[i - 1] = prev[:-1]
            i += 1
        elif is_last and not strict:
            groups[i - 1] = prev + lone             # last resort: join even if a bit long
            del groups[i]
        else:
            i += 1
    return groups


WORDS_CHOICES = (1, 2, 3, 4, 5, 6)   # what the user can pick in "Words per line"


def clean_max_words(value):
    """The user's "words per line" choice as an int, or None for automatic (2-6)."""
    try:
        value = int(value)
    except (TypeError, ValueError):
        return None
    return value if value in WORDS_CHOICES else None


def split_into_lines(segments, max_words=None, max_chars=MAX_CHARS, max_pause=MAX_PAUSE):
    """Turn transcript segments into caption lines.

    max_words None: automatic, about 2-6 words and at most 32 characters.
    max_words N: at most N words per line, whatever their length (long
    lines are broken into two rows or shrunk when the video is drawn).
    """
    strict = max_words is not None
    if strict:
        max_chars = 10_000
    else:
        max_words = MAX_WORDS
    lines = []
    for segment in segments:
        words = [dict(w) for w in segment.get("words", []) if w.get("word", "").strip()]
        if not words:
            continue
        groups = _split_segment(words, max_words, max_chars, max_pause)
        groups = _fix_orphans(groups, max_words, max_chars, strict)
        lines.extend(_line_from_words(g) for g in groups)
    return lines


def reflow(lines, max_words=None):
    """Re-cut existing lines into new ones with a different number of words.

    Uses the words as they are now, so text edits are kept. Pauses and
    sentence ends still start a new line.
    """
    words = [dict(w) for line in lines for w in line.get("words", [])]
    return split_into_lines([{"words": words}], max_words=max_words)


def insert_line(lines, index, text="New line"):
    """Add a new line after line `index` (index -1 = at the very start).

    It fills the gap to the next line, or takes 1.5 seconds if there is no gap.
    """
    lines = copy.deepcopy(lines)
    after = lines[index]["end"] if 0 <= index < len(lines) else 0.0
    nxt = lines[index + 1]["start"] if index + 1 < len(lines) else None
    start = after
    if nxt is None or nxt - after < 0.4:
        end = start + 1.5
    else:
        end = min(nxt, start + 3.0)
    words = spread_words(text, start, end)
    line = {"start": round(start, 3), "end": round(end, 3), "text": " ".join(w["word"] for w in words), "words": words}
    lines.insert(index + 1, line)
    lines.sort(key=lambda l: l["start"])
    return lines


def spread_words(text, start, end):
    """Give each word of `text` a time slot between start and end, by word length."""
    tokens = text.split()
    if not tokens:
        return []
    end = max(end, start + MIN_DURATION)
    total = sum(len(t) for t in tokens)
    words = []
    cursor = start
    for t in tokens:
        length = (end - start) * len(t) / total
        words.append({"word": t, "start": round(cursor, 3), "end": round(cursor + length, 3)})
        cursor += length
    words[-1]["end"] = round(end, 3)
    return words


def set_line_text(line, new_text):
    """Return the line with new text. Word timings are kept when the word count is the same."""
    tokens = new_text.split()
    old = line.get("words", [])
    if len(tokens) == len(old) and tokens:
        words = [dict(w, word=t) for w, t in zip(old, tokens)]
    else:
        words = spread_words(new_text, line["start"], line["end"])
    return {"start": line["start"], "end": line["end"], "text": " ".join(tokens), "words": words}


def set_line_times(line, start, end):
    """Return the line moved/stretched to new start and end times (words follow along)."""
    start = max(0.0, float(start))
    end = max(float(end), start + MIN_DURATION)
    old_start, old_end = line["start"], line["end"]
    scale = (end - start) / max(old_end - old_start, 0.001)
    words = []
    for w in line.get("words", []):
        ws = start + (w["start"] - old_start) * scale
        we = start + (w["end"] - old_start) * scale
        words.append({"word": w["word"], "start": round(ws, 3), "end": round(max(we, ws + 0.01), 3)})
    return {"start": round(start, 3), "end": round(end, 3), "text": line["text"], "words": words}


def nudge_line(lines, index, start_delta=0.0, end_delta=0.0):
    """Shift the start and/or end of one line by a few fractions of a second.

    The line is not allowed to overlap its neighbours.
    """
    lines = copy.deepcopy(lines)
    line = lines[index]
    lowest = lines[index - 1]["end"] if index > 0 else 0.0
    highest = lines[index + 1]["start"] if index + 1 < len(lines) else float("inf")
    start = min(max(line["start"] + start_delta, lowest), line["end"] + end_delta - MIN_DURATION)
    start = max(start, 0.0)
    end = max(min(line["end"] + end_delta, highest), start + MIN_DURATION)
    lines[index] = set_line_times(line, start, end)
    return lines


def split_line(lines, index, word_index):
    """Split one line in two. word_index is the first word of the second half."""
    line = lines[index]
    words = line["words"]
    if not 0 < word_index < len(words):
        raise ValueError("Cannot split here: pick a word in the middle of the line.")
    first, second = _line_from_words(words[:word_index]), _line_from_words(words[word_index:])
    first["start"], second["end"] = line["start"], line["end"]
    return lines[:index] + [first, second] + lines[index + 1:]


def merge_lines(lines, index):
    """Join line `index` with the line after it."""
    if not 0 <= index < len(lines) - 1:
        raise ValueError("There is no next line to merge with.")
    a, b = lines[index], lines[index + 1]
    merged = _line_from_words(a["words"] + b["words"])
    merged["start"], merged["end"] = a["start"], max(b["end"], a["start"] + MIN_DURATION)
    return lines[:index] + [merged] + lines[index + 2:]


def clean_lines(lines):
    """Validate lines coming from the editor and repair small problems.

    Drops empty lines, sorts by time, and rebuilds word timings when the
    text no longer matches the words.
    """
    result = []
    for raw in lines:
        text = " ".join(str(raw.get("text", "")).split())
        if not text:
            continue
        start = max(0.0, float(raw.get("start", 0)))
        end = max(float(raw.get("end", start)), start + MIN_DURATION)
        words = raw.get("words") or []
        same_text = " ".join(str(w.get("word", "")) for w in words) == text
        if same_text:
            line = set_line_times({"start": float(words[0]["start"]), "end": float(words[-1]["end"]),
                                   "text": text, "words": words}, start, end) \
                if (abs(words[0]["start"] - start) > 0.001 or abs(words[-1]["end"] - end) > 0.001) \
                else {"start": round(start, 3), "end": round(end, 3), "text": text,
                      "words": [{"word": w["word"], "start": float(w["start"]), "end": float(w["end"])} for w in words]}
        else:
            base = {"start": start, "end": end, "text": text, "words": words}
            line = set_line_text(base, text)
        result.append(line)
    result.sort(key=lambda l: l["start"])
    return result


def display_times(lines, linger=0.25):
    """When each line is on screen: it stays a moment after its last word,
    but never overlaps the next line. Returns a list of (start, end)."""
    times = []
    for i, line in enumerate(lines):
        end = line["end"] + linger
        if i + 1 < len(lines):
            end = min(end, lines[i + 1]["start"])
        times.append((line["start"], max(end, line["start"] + 0.05)))
    return times


def _srt_time(seconds):
    """Format seconds as an SRT timestamp: 00:00:01,250"""
    ms = int(round(max(seconds, 0) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def to_srt(lines):
    """Build the text of a standard .srt subtitle file."""
    blocks = []
    for n, (line, (start, end)) in enumerate(zip(lines, display_times(lines)), 1):
        blocks.append(f"{n}\n{_srt_time(start)} --> {_srt_time(end)}\n{line['text']}\n")
    return "\n".join(blocks)
