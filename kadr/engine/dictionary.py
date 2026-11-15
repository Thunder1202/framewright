"""Custom dictionary: fixes words the speech model keeps getting wrong.

dictionary.txt has one rule per line:

    wrong spelling => Right Spelling      (replace what was heard)
    Oqtepa Lavash                         (a name: always use exactly this spelling)
    # lines starting with # are notes

Matching ignores upper/lower case and the kind of apostrophe. Rules may be
several words long.
"""
import re

from . import config
from .captions import spread_words

_APOSTROPHES = "'`ʻʼ‘’´′"
_EDGE_PUNCT = ".,!?;:…\"«»()[]–—-"


def _key(token):
    """Form of a word used for comparing: lower-case, plain apostrophes, no edge punctuation."""
    token = token.strip(_EDGE_PUNCT).lower()
    return re.sub("[" + re.escape(_APOSTROPHES) + "]", "'", token)


def parse_dictionary(text):
    """Turn the text of dictionary.txt into a list of (source tokens, target tokens)."""
    rules = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=>" in line:
            source, target = (part.strip() for part in line.split("=>", 1))
        else:
            source = target = line
        source_keys = [_key(t) for t in source.split()]
        source_keys = [k for k in source_keys if k]
        if source_keys and target.split():
            rules.append((source_keys, target.split()))
    rules.sort(key=lambda r: len(r[0]), reverse=True)   # longer phrases first
    return rules


def load_dictionary(path=None):
    """Read dictionary.txt. A missing file simply means "no rules"."""
    path = path or config.DICTIONARY_FILE
    try:
        with open(path, encoding="utf-8-sig") as f:
            return parse_dictionary(f.read())
    except FileNotFoundError:
        return []


def apply_to_words(words, rules):
    """Apply the rules to a list of word dicts. Returns a new list; timings are kept."""
    words = [dict(w) for w in words]
    for source, target in rules:
        n = len(source)
        i = 0
        while i + n <= len(words):
            window = words[i:i + n]
            if [_key(w["word"]) for w in window] != source:
                i += 1
                continue
            # Keep punctuation that was stuck to the outside of the matched words.
            first, last = window[0]["word"], window[-1]["word"]
            lead = first[:len(first) - len(first.lstrip(_EDGE_PUNCT))]
            trail = last[len(last.rstrip(_EDGE_PUNCT)):]
            new_tokens = list(target)
            new_tokens[0] = lead + new_tokens[0]
            new_tokens[-1] = new_tokens[-1] + trail
            if len(new_tokens) == n:
                replacement = [dict(w, word=t) for w, t in zip(window, new_tokens)]
            else:
                replacement = spread_words(" ".join(new_tokens), window[0]["start"], window[-1]["end"])
            words[i:i + n] = replacement
            i += len(replacement)
    return words


def apply_to_segments(segments, rules=None):
    """Apply the dictionary to every segment of a transcript. Returns new segments."""
    if rules is None:
        rules = load_dictionary()
    if not rules:
        return segments
    result = []
    for seg in segments:
        words = apply_to_words(seg.get("words", []), rules)
        result.append(dict(seg, words=words, text=" ".join(w["word"] for w in words)))
    return result
