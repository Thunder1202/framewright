/**
 * Uzbek Latin <-> Cyrillic. The same rules as kadr/engine/translit.py, so captions
 * convert the same way in both programs. Pure, unit tested.
 *
 *   toCyrillic('O‘zbekiston') -> 'Ўзбекистон'
 *   toLatin('Ўзбекистон')     -> 'O‘zbekiston'
 *
 * Known limits: Latin "ts" is ambiguous (litsey = лицей, aytsa = айтса) and the Russian
 * soft sign cannot be guessed, except for the common words in the exception list.
 */

const OKINA = '‘'; // after o and g: o‘ g‘
const TUTUQ = '’'; // tutuq belgisi: ma’no
/** Every apostrophe-like character people actually type. */
const APOSTROPHES = "'`ʻʼ‘’´′";
const LATIN_VOWELS = 'aeiou';
const CYRILLIC_VOWELS = 'аеёиоуэюяў';

const LAT_SINGLE: Record<string, string> = {
  a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н',
  o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', w: 'в', c: 'с',
};
const LAT_DIGRAPHS: Record<string, string> = { sh: 'ш', ch: 'ч', yo: 'ё', yu: 'ю', ya: 'я' };

/** Word beginnings the rules alone get wrong. Endings after the stem use the normal rules. */
const LAT_EXCEPTIONS: Record<string, string> = {
  litsey: 'лицей', militsiya: 'милиция', shveytsariya: 'швейцария', ofitser: 'офицер', protsent: 'процент',
  protsess: 'процесс', retsept: 'рецепт', konsert: 'концерт', sirk: 'цирк', sement: 'цемент', abzats: 'абзац',
  kvarts: 'кварц', shprits: 'шприц', rayon: 'район', mayor: 'майор', yod: 'йод', yogurt: 'йогурт',
  sentyabr: 'сентябрь', oktyabr: 'октябрь', noyabr: 'ноябрь', dekabr: 'декабрь', yanvar: 'январь',
  fevral: 'февраль', aprel: 'апрель', iyun: 'июнь', iyul: 'июль',
};
const EXCEPTION_STEMS = Object.keys(LAT_EXCEPTIONS).sort((a, b) => b.length - a.length);

const A = `[${APOSTROPHES.replace(/[\\\]^-]/g, '\\$&')}]`;
// letters with apostrophes inside; a closing apostrophe only belongs to the word after o/g (bog‘)
const WORD = new RegExp(`\\p{L}+(?:${A}\\p{L}+)*(?:(?<=[oOgG])${A})?`, 'gu');

const isUpper = (ch: string | undefined) => !!ch && ch !== ch.toLowerCase();
const allUpper = (w: string) => w === w.toUpperCase() && w !== w.toLowerCase();
const isApos = (ch: string) => ch !== '' && APOSTROPHES.includes(ch);

function tsIsTse(low: string, i: number): boolean {
  if (i === 0) return true; // tsirk, tsex
  const rest = low.slice(i + 2);
  return rest.startsWith('iya') || rest.startsWith('ion') || rest.startsWith('iy');
}

function latinCore(word: string): string {
  const out: string[] = [];
  const low = word.toLowerCase();
  const n = word.length;
  const cased = (s: string, up: boolean) => (up ? s.toUpperCase() : s);
  let i = 0;
  while (i < n) {
    const ch = low[i];
    const up = isUpper(word[i]);
    const nxt = low[i + 1] ?? '';
    const nxt2 = low[i + 2] ?? '';
    const prev = i > 0 ? low[i - 1] : '';
    // "after a vowel or at the start" decides e/э and ye/е
    const afterVowel = i === 0 || LATIN_VOWELS.includes(prev) || isApos(prev);

    if ((ch === 'o' || ch === 'g') && isApos(nxt)) {
      out.push(cased(ch === 'o' ? 'ў' : 'ғ', up));
      i += 2;
    } else if (ch === 'y' && nxt === 'o' && isApos(nxt2)) {
      out.push(cased('й', up)); // yo‘l -> йўл
      i += 1;
    } else if (ch === 's' && isApos(nxt) && nxt2 === 'h') {
      out.push(cased('с', up)); // Is’hoq -> Исҳоқ
      i += 2;
    } else if (ch === 't' && nxt === 's' && tsIsTse(low, i)) {
      out.push(cased('ц', up));
      i += 2;
    } else if (ch === 'y' && nxt === 'e') {
      out.push(cased(afterVowel ? 'е' : 'ье', up));
      i += 2;
    } else if (nxt && LAT_DIGRAPHS[ch + nxt]) {
      out.push(cased(LAT_DIGRAPHS[ch + nxt], up));
      i += 2;
    } else if (ch === 'e') {
      out.push(cased(afterVowel ? 'э' : 'е', up));
      i += 1;
    } else if (isApos(ch)) {
      // the hard sign stays upper-case inside an ALL-CAPS word
      out.push(i > 0 && isUpper(word[i - 1]) && isUpper(word[i + 1]) ? 'Ъ' : 'ъ');
      i += 1;
    } else if (LAT_SINGLE[ch]) {
      out.push(cased(LAT_SINGLE[ch], up));
      i += 1;
    } else {
      out.push(word[i]);
      i += 1;
    }
  }
  return out.join('');
}

function latinWord(word: string): string {
  const low = word.toLowerCase();
  for (const stem of EXCEPTION_STEMS) {
    if (!low.startsWith(stem)) continue;
    const head = LAT_EXCEPTIONS[stem];
    const tail = latinCore('x' + word.slice(stem.length)).slice(1); // "x" stands for "after a consonant"
    if (allUpper(word) && word.length > 1) return (head + tail).toUpperCase();
    if (isUpper(word[0])) return head[0].toUpperCase() + head.slice(1) + tail;
    return head + tail;
  }
  return latinCore(word);
}

export function toCyrillic(text: string): string {
  return text.replace(WORD, (w) => latinWord(w));
}

const CYR_SINGLE: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'i',
  э: 'e', ю: 'yu', я: 'ya', ё: 'yo', ў: 'o' + OKINA, қ: 'q', ғ: 'g' + OKINA, ҳ: 'h', ь: '',
};

function casedLatin(latin: string, upper: boolean, allCaps: boolean): string {
  if (!upper || !latin) return latin;
  return allCaps ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
}

function cyrillicWord(word: string): string {
  const out: string[] = [];
  const low = word.toLowerCase();
  const n = word.length;
  for (let i = 0; i < n; i++) {
    const ch = low[i];
    const up = isUpper(word[i]);
    const prev = i > 0 ? low[i - 1] : '';
    const nxt = low[i + 1] ?? '';
    // ALL CAPS if a neighbour is upper-case too (ШАҲАР -> SHAHAR, Шаҳар -> Shahar)
    const allCaps = i + 1 < n ? isUpper(word[i + 1]) : i > 0 && isUpper(word[i - 1]);

    if (ch === 'е') {
      const startLike = i === 0 || CYRILLIC_VOWELS.includes(prev) || 'ъь'.includes(prev);
      out.push(casedLatin(startLike ? 'ye' : 'e', up, allCaps));
    } else if (ch === 'ъ') {
      if (prev === 'ў') continue; // мўъжиза -> mo‘jiza
      out.push(TUTUQ);
    } else if (ch === 'с' && nxt === 'ҳ') {
      out.push(casedLatin('s', up, allCaps) + TUTUQ); // Исҳоқ -> Is’hoq, not "sh"
    } else if (ch in CYR_SINGLE) {
      out.push(casedLatin(CYR_SINGLE[ch], up, allCaps));
    } else {
      out.push(word[i]);
    }
  }
  return out.join('');
}

export function toLatin(text: string): string {
  return text.replace(WORD, (w) => cyrillicWord(w));
}

export type Script = 'to_cyrillic' | 'to_latin';
export const convertScript = (text: string, direction: Script) => (direction === 'to_cyrillic' ? toCyrillic(text) : toLatin(text));
