"""Uzbek Latin <-> Cyrillic converter. Pure functions, no dependencies.

    to_cyrillic("O‘zbekiston")  ->  "Ўзбекистон"
    to_latin("Ўзбекистон")      ->  "O‘zbekiston"

Known limits (also listed in the README):
- Latin "ts" is ambiguous: "litsey" is лицей but "aytsa" is айтса. We write ц
  at the start of a word, in "-tsiya/-tsion" endings and for a short list of
  loan words. Everything else becomes тс.
- The Russian soft sign (ь) does not exist in Uzbek Latin, so it cannot be
  restored except for a few common words in the exception list.
"""
import re

OKINA = "‘"      # ‘  written after o and g:  o‘  g‘
TUTUQ = "’"      # ’  tutuq belgisi:          ma’no
# Every apostrophe-like character people actually type.
APOSTROPHES = "'`ʻʼ‘’´′"

LATIN_VOWELS = "aeiou"
CYRILLIC_VOWELS = "аеёиоуэюяў"

# ---------- Latin -> Cyrillic ----------

LAT_SINGLE = {
    "a": "а", "b": "б", "d": "д", "e": "е", "f": "ф", "g": "г", "h": "ҳ", "i": "и",
    "j": "ж", "k": "к", "l": "л", "m": "м", "n": "н", "o": "о", "p": "п", "q": "қ",
    "r": "р", "s": "с", "t": "т", "u": "у", "v": "в", "x": "х", "y": "й", "z": "з",
    "w": "в", "c": "с",
}
LAT_DIGRAPHS = {"sh": "ш", "ch": "ч", "yo": "ё", "yu": "ю", "ya": "я"}

# Word beginnings that the rules alone get wrong (Latin stem -> Cyrillic stem).
# Endings after the stem are converted by the normal rules. Add your own here.
LAT_EXCEPTIONS = {
    "litsey": "лицей", "militsiya": "милиция", "shveytsariya": "швейцария",
    "ofitser": "офицер", "protsent": "процент", "protsess": "процесс",
    "retsept": "рецепт", "konsert": "концерт", "sirk": "цирк", "sement": "цемент",
    "abzats": "абзац", "kvarts": "кварц", "shprits": "шприц",
    "rayon": "район", "mayor": "майор", "yod": "йод", "yogurt": "йогурт",
    "sentyabr": "сентябрь", "oktyabr": "октябрь", "noyabr": "ноябрь",
    "dekabr": "декабрь", "yanvar": "январь", "fevral": "февраль", "aprel": "апрель",
    "iyun": "июнь", "iyul": "июль",
}
_EXCEPTION_STEMS = sorted(LAT_EXCEPTIONS, key=len, reverse=True)

# A "word" is letters plus apostrophes inside it.
# A closing apostrophe only belongs to the word after o/g (bog‘), so 'quoted' text stays safe.
_A = "[" + re.escape(APOSTROPHES) + "]"
_WORD_RE = re.compile(r"[^\W\d_]+(?:" + _A + r"[^\W\d_]+)*(?:(?<=[oOgG])" + _A + r")?")


def _match_case(result, source_upper):
    """Upper-case the Cyrillic result if the Latin source letter was upper-case."""
    return result.upper() if source_upper else result


def _latin_core_to_cyrillic(word):
    """Convert one Latin word (or the rest of a word) with the letter rules."""
    out = []
    low = word.lower()
    n = len(word)
    i = 0
    while i < n:
        ch = low[i]
        up = word[i].isupper()
        nxt = low[i + 1] if i + 1 < n else ""
        nxt2 = low[i + 2] if i + 2 < n else ""
        prev = low[i - 1] if i > 0 else ""
        # "After a vowel or at the start" decides e/э and ye/е.
        after_vowel = (i == 0) or (prev in LATIN_VOWELS) or (prev in APOSTROPHES)

        if ch in "og" and nxt and nxt in APOSTROPHES:            # o‘ -> ў, g‘ -> ғ
            out.append(_match_case("ў" if ch == "o" else "ғ", up))
            i += 2
        elif ch == "y" and nxt == "o" and nxt2 and nxt2 in APOSTROPHES:   # yo‘l -> йўл
            out.append(_match_case("й", up))
            i += 1
        elif ch == "s" and nxt and nxt in APOSTROPHES and nxt2 == "h":    # Is’hoq -> Исҳоқ
            out.append(_match_case("с", up))
            i += 2
        elif ch == "t" and nxt == "s" and _ts_is_tse(low, i):    # ts -> ц
            out.append(_match_case("ц", up))
            i += 2
        elif ch == "y" and nxt == "e":                           # ye -> е (ье after a consonant)
            out.append(_match_case("е" if after_vowel else "ье", up))
            i += 2
        elif ch + nxt in LAT_DIGRAPHS:
            out.append(_match_case(LAT_DIGRAPHS[ch + nxt], up))
            i += 2
        elif ch == "e":
            out.append(_match_case("э" if after_vowel else "е", up))
            i += 1
        elif ch in APOSTROPHES:                                  # tutuq belgisi -> ъ
            # Keep the hard sign upper-case inside an ALL-CAPS word.
            out.append("Ъ" if (i > 0 and word[i - 1].isupper() and word[i + 1:i + 2].isupper()) else "ъ")
            i += 1
        elif ch in LAT_SINGLE:
            out.append(_match_case(LAT_SINGLE[ch], up))
            i += 1
        else:
            out.append(word[i])                                  # not a Latin letter: keep
            i += 1
    return "".join(out)


def _ts_is_tse(low, i):
    """Decide if the "ts" at position i means ц (true) or т+с (false)."""
    if i == 0:
        return True                                   # tsirk, tsex
    rest = low[i + 2:]
    return rest.startswith(("iya", "ion", "iy"))      # stansiya-type: konstitutsiya, aksiya


def _latin_word_to_cyrillic(word):
    """Convert one Latin word, using the exception list for its beginning."""
    low = word.lower()
    for stem in _EXCEPTION_STEMS:
        if low.startswith(stem):
            head = LAT_EXCEPTIONS[stem]
            tail = _latin_core_to_cyrillic("x" + word[len(stem):])[1:]  # "x" = "after a consonant"
            if word.isupper() and len(word) > 1:
                return (head + tail).upper()
            if word[0].isupper():
                return head[0].upper() + head[1:] + tail
            return head + tail
    return _latin_core_to_cyrillic(word)


def to_cyrillic(text):
    """Convert Uzbek Latin text to Uzbek Cyrillic. Other characters are kept."""
    return _WORD_RE.sub(lambda m: _latin_word_to_cyrillic(m.group(0)), text)


# ---------- Cyrillic -> Latin ----------

CYR_SINGLE = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ж": "j", "з": "z", "и": "i",
    "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh",
    "щ": "sh", "ы": "i", "э": "e", "ю": "yu", "я": "ya", "ё": "yo",
    "ў": "o" + OKINA, "қ": "q", "ғ": "g" + OKINA, "ҳ": "h", "ь": "",
}


def _cased(latin, upper, all_caps):
    """Apply case to a Latin piece: "sh" -> "Sh" (Title) or "SH" (ALL CAPS)."""
    if not upper or not latin:
        return latin
    return latin.upper() if all_caps else latin[0].upper() + latin[1:]


def _cyrillic_word_to_latin(word):
    """Convert one Cyrillic word with the letter rules."""
    out = []
    low = word.lower()
    n = len(word)
    for i, ch in enumerate(low):
        up = word[i].isupper()
        prev = low[i - 1] if i > 0 else ""
        nxt = low[i + 1] if i + 1 < n else ""
        # ALL CAPS if a neighbour letter is upper-case too (ШАҲАР -> SHAHAR, Шаҳар -> Shahar).
        if i + 1 < n:
            all_caps = word[i + 1].isupper()
        else:
            all_caps = i > 0 and word[i - 1].isupper()

        if ch == "е":
            start_like = (i == 0) or (prev in CYRILLIC_VOWELS) or (prev in "ъь")
            out.append(_cased("ye" if start_like else "e", up, all_caps))
        elif ch == "ъ":
            if prev == "ў":
                continue                      # мўъжиза -> mo‘jiza (official spelling)
            out.append(TUTUQ)
        elif ch == "с" and nxt == "ҳ":
            out.append(_cased("s", up, all_caps) + TUTUQ)   # Исҳоқ -> Is’hoq (not "sh")
        elif ch in CYR_SINGLE:
            out.append(_cased(CYR_SINGLE[ch], up, all_caps))
        else:
            out.append(word[i])
    return "".join(out)


def to_latin(text):
    """Convert Uzbek Cyrillic text to Uzbek Latin. Other characters are kept."""
    return _WORD_RE.sub(lambda m: _cyrillic_word_to_latin(m.group(0)), text)


def normalize_apostrophes(text):
    """Rewrite typed apostrophes (' ` ʻ) in Latin text to the proper ‘ and ’ marks."""
    def fix(m):
        letter = m.group(1)
        return letter + (OKINA if letter.lower() in "og" else TUTUQ)
    return re.sub(r"([^\W\d_])[" + re.escape(APOSTROPHES) + r"]", fix, text)


def convert(text, direction):
    """direction: "to_cyrillic" or "to_latin"."""
    if direction == "to_cyrillic":
        return to_cyrillic(text)
    if direction == "to_latin":
        return to_latin(text)
    raise ValueError("direction must be 'to_cyrillic' or 'to_latin'")
