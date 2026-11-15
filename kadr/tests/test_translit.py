"""Tests for the Uzbek Latin <-> Cyrillic converter."""
import pytest

from engine.translit import convert, normalize_apostrophes, to_cyrillic, to_latin

# (Latin, Cyrillic) pairs that must convert correctly in BOTH directions.
ROUND_TRIP = [
    # special letters and digraphs
    ("O‘zbekiston", "Ўзбекистон"),
    ("g‘isht", "ғишт"),
    ("o‘g‘il", "ўғил"),
    ("to‘g‘ri", "тўғри"),
    ("bog‘", "боғ"),
    ("tog‘", "тоғ"),
    ("shahar", "шаҳар"),
    ("choy", "чой"),
    ("qalam", "қалам"),
    ("hafta", "ҳафта"),
    ("xalq", "халқ"),
    ("ming", "минг"),
    ("dengiz", "денгиз"),
    ("ko‘ngil", "кўнгил"),
    ("qishloq", "қишлоқ"),
    ("ochiq", "очиқ"),
    ("rahmat", "раҳмат"),
    ("chiroyli", "чиройли"),
    # yo / yu / ya / ye / e
    ("yosh", "ёш"),
    ("yulduz", "юлдуз"),
    ("yangi", "янги"),
    ("yer", "ер"),
    ("ekin", "экин"),
    ("kecha", "кеча"),
    ("daryo", "дарё"),
    ("quyosh", "қуёш"),
    ("buyuk", "буюк"),
    ("ayiq", "айиқ"),
    ("poyezd", "поезд"),
    ("yo‘l", "йўл"),
    ("Yo‘ldosh", "Йўлдош"),
    ("Yevropa", "Европа"),
    ("premyera", "премьера"),
    # tutuq belgisi
    ("ma’no", "маъно"),
    ("a’lo", "аъло"),
    ("san’at", "санъат"),
    ("e’lon", "эълон"),
    ("she’r", "шеър"),
    ("E’tibor", "Эътибор"),
    ("ob’yekt", "объект"),
    ("Is’hoq", "Исҳоқ"),
    # ts
    ("tsirk", "цирк"),
    ("konstitutsiya", "конституция"),
    ("litsey", "лицей"),
    ("aytsa", "айтса"),
    # capital letters
    ("Toshkent", "Тошкент"),
    ("Shahar", "Шаҳар"),
    ("SHAHAR", "ШАҲАР"),
    ("CHOY", "ЧОЙ"),
    ("O‘ZBEKISTON", "ЎЗБЕКИСТОН"),
    ("YEVROPA", "ЕВРОПА"),
    ("MA’NO", "МАЪНО"),
    ("G‘ALABA", "ҒАЛАБА"),
    # sentences
    ("Men maktabga boraman.", "Мен мактабга бораман."),
    ("Bugun havo juda yaxshi!", "Бугун ҳаво жуда яхши!"),
    ("O‘zbekiston — go‘zal yurt.", "Ўзбекистон — гўзал юрт."),
    ("Assalomu alaykum, do‘stlar!", "Ассалому алайкум, дўстлар!"),
    ("Xush kelibsiz, aziz mehmonlar.", "Хуш келибсиз, азиз меҳмонлар."),
    ("2024-yil, 5 ta kitob", "2024-йил, 5 та китоб"),
    ("Bu video sizga yoqdimi? Obuna bo‘ling!", "Бу видео сизга ёқдими? Обуна бўлинг!"),
]


@pytest.mark.parametrize("latin,cyrillic", ROUND_TRIP)
def test_latin_to_cyrillic(latin, cyrillic):
    assert to_cyrillic(latin) == cyrillic


@pytest.mark.parametrize("latin,cyrillic", ROUND_TRIP)
def test_cyrillic_to_latin(latin, cyrillic):
    assert to_latin(cyrillic) == latin


@pytest.mark.parametrize("latin,cyrillic", ROUND_TRIP)
def test_round_trip_both_ways(latin, cyrillic):
    assert to_latin(to_cyrillic(latin)) == latin
    assert to_cyrillic(to_latin(cyrillic)) == cyrillic


# One-direction cases: (input, expected).
TO_CYRILLIC_ONLY = [
    ("o'zbek", "ўзбек"),          # typewriter apostrophe
    ("oʻzbek", "ўзбек"),          # U+02BB
    ("o`zbek", "ўзбек"),          # backtick
    ("o’zbek", "ўзбек"),          # right quote typed after o
    ("g'oya", "ғоя"),
    ("ma'no", "маъно"),
    ("rayon", "район"),           # exception list: not "раён"
    ("rayonda", "районда"),       # exception + ending
    ("sentyabr", "сентябрь"),
    ("Oktyabr", "Октябрь"),
    ("konsert", "концерт"),
    ("Привет, do‘stim", "Привет, дўстим"),   # Cyrillic words are left alone
    ("'salom'", "'салом'"),       # quotes around a word are not letters
]

TO_LATIN_ONLY = [
    ("мўъжиза", "mo‘jiza"),       # official spelling drops ъ after ў
    ("Ёш", "Yosh"),
    ("ЁШ", "YOSH"),
    ("Чой", "Choy"),
    ("Я", "Ya"),
    ("район", "rayon"),
    ("сентябрь", "sentyabr"),
    ("Hello мир", "Hello mir"),   # Latin words are left alone
    ("щётка", "shyotka"),
]


@pytest.mark.parametrize("source,expected", TO_CYRILLIC_ONLY)
def test_to_cyrillic_special_cases(source, expected):
    assert to_cyrillic(source) == expected


@pytest.mark.parametrize("source,expected", TO_LATIN_ONLY)
def test_to_latin_special_cases(source, expected):
    assert to_latin(source) == expected


def test_empty_and_plain_text():
    assert to_cyrillic("") == ""
    assert to_latin("") == ""
    assert to_cyrillic("123 !?") == "123 !?"


def test_normalize_apostrophes():
    assert normalize_apostrophes("o'zbek ma'no g`isht") == "o‘zbek ma’no g‘isht"


def test_convert_direction():
    assert convert("salom", "to_cyrillic") == "салом"
    assert convert("салом", "to_latin") == "salom"
    with pytest.raises(ValueError):
        convert("salom", "sideways")


def test_enough_cases():
    """The project brief asks for at least 40 word and sentence cases."""
    assert len(ROUND_TRIP) + len(TO_CYRILLIC_ONLY) + len(TO_LATIN_ONLY) >= 40
