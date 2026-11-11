// Compares what a sentence should say with what a speech recognizer heard, in any language.
// Both texts are folded to a comparable form first: case, accents, punctuation, symbols read aloud
// ("dot", "nokta", "точка") and numbers. A recognizer writes "200 OK" or "192.168.1.10" where the
// narration says "two hundred OK" or "one nine two, one six eight", so every run of numbers (digits or
// number words) becomes a single "#". The folded texts are then aligned letter by letter: a voice that
// slurs or drops a word leaves a run of missing letters, while recognizer spelling noise ("codex" for
// "codecs", "okay" for "OK") stays small.

/** Bumped whenever folding changes, so cached checks are redone with the new rules. */
export const NORMALIZER_VERSION = 1;

const words = text => text.split(/\s+/).filter(Boolean);

/**
 * Per language: `num` are number words and the pieces compound numbers are built from (a word made only
 * of these pieces counts as a number: "zweihundertdreiundzwanzig", "ventitré"), `join` the words that
 * link numbers ("one hundred and five"), `symbols` how punctuation is read aloud (dropped, because a
 * recognizer writes the symbol instead), `same` spellings that mean the same.
 */
const LANGS = {
  en: {
    num: 'zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion point',
    join: 'and',
    symbols: ['dot', 'colon', 'slash', 'backslash', 'at', 'dash', 'hyphen', 'underscore', 'hash', 'hashtag', 'percent', 'per cent', 'plus', 'equals', 'ampersand'],
    same: { okay: 'ok' }
  },
  tr: {
    num: 'sıfır bir iki üç dört beş altı yedi sekiz dokuz on yirmi otuz kırk elli altmış yetmiş seksen doksan yüz bin milyon milyar virgül',
    symbols: ['iki nokta üst üste', 'iki nokta', 'nokta', 'et', 'ters eğik çizgi', 'eğik çizgi', 'tire', 'alt çizgi', 'yüzde', 'artı', 'eşittir'],
    same: { okey: 'ok', okay: 'ok' }
  },
  fr: {
    num: 'zéro un une deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize vingt vingts trente quarante cinquante soixante cent cents mille million millions milliard milliards virgule',
    join: 'et',
    symbols: ['deux points', 'point', 'arobase', 'barre oblique', 'slash', 'tiret', 'trait dunion', 'pour cent', 'pourcent', 'plus', 'égal', 'égale', 'égalent'],
    same: { okay: 'ok', 'o k': 'ok' }
  },
  es: {
    num: 'cero uno una un dos tres cuatro cinco seis siete ocho nueve diez dieci once doce trece catorce quince veinte veinti treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento cientos doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos mil millón millones coma',
    join: 'y',
    symbols: ['dos puntos', 'punto', 'arroba', 'barra', 'guion', 'guión', 'por ciento', 'más', 'igual'],
    same: { okay: 'ok', 'o k': 'ok' }
  },
  it: {
    num: 'zero uno una un due tre tré quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove venti vent trenta trent quaranta quarant cinquanta cinquant sessanta sessant settanta settant ottanta ottant novanta novant cento mille mila milione milioni miliardo miliardi virgola',
    join: 'e',
    symbols: ['due punti', 'punto', 'chiocciola', 'barra', 'trattino', 'per cento', 'percento', 'più', 'uguale'],
    same: { okay: 'ok', 'o k': 'ok' }
  },
  pt: {
    num: 'zero um uma dois duas três quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos duzentas trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos mil milhão milhões bilhão vírgula',
    join: 'e',
    symbols: ['dois pontos', 'ponto', 'arroba', 'barra', 'hífen', 'traço', 'por cento', 'mais', 'igual'],
    same: { okay: 'ok', 'o k': 'ok' }
  },
  de: {
    num: 'null eins ein eine zwei drei vier fünf sechs sech sieben sieb acht neun zehn elf zwölf zwanzig dreißig dreissig vierzig fünfzig sechzig siebzig achtzig neunzig hundert tausend million millionen milliarde milliarden komma und',
    join: 'und',
    symbols: ['doppelpunkt', 'punkt', 'at', 'klammeraffe', 'schrägstrich', 'bindestrich', 'strich', 'unterstrich', 'prozent', 'plus', 'gleich'],
    same: { okay: 'ok', 'o k': 'ok' }
  },
  nl: {
    num: 'nul een twee drie vier vijf zes zeven acht negen tien elf twaalf dertien veertien twintig dertig veertig vijftig zestig zeventig tachtig negentig honderd duizend miljoen miljard komma en',
    join: 'en',
    symbols: ['dubbele punt', 'punt', 'apenstaartje', 'schuine streep', 'streepje', 'procent', 'plus', 'is gelijk aan'],
    same: { okay: 'ok', oké: 'ok' }
  },
  ru: {
    num: 'ноль нуль один одна одно два две три четыре пять шесть семь восемь девять десять одиннадцать двенадцать тринадцать четырнадцать пятнадцать шестнадцать семнадцать восемнадцать девятнадцать двадцать тридцать сорок пятьдесят шестьдесят семьдесят восемьдесят девяносто сто двести триста четыреста пятьсот шестьсот семьсот восемьсот девятьсот тысяча тысячи тысяч миллион миллиона миллионов миллиард запятая',
    symbols: ['двоеточие', 'точка', 'собака', 'слэш', 'слеш', 'косая черта', 'дефис', 'тире', 'процент', 'процента', 'процентов', 'плюс', 'равно'],
    same: { окей: 'ok', ок: 'ok', ok: 'ok' }
  },
  uk: {
    num: 'нуль один одна одне два дві три чотири пять шість сім вісім девять десять одинадцять дванадцять тринадцять чотирнадцять пятнадцять шістнадцять сімнадцять вісімнадцять девятнадцять двадцять тридцять сорок пятдесят шістдесят сімдесят вісімдесят девяносто сто двісті триста чотириста пятсот шістсот сімсот вісімсот девятсот тисяча тисячі тисяч мільйон мільйона мільйонів кома',
    symbols: ['двокрапка', 'крапка', 'равлик', 'слеш', 'скісна риска', 'дефіс', 'тире', 'відсоток', 'відсотки', 'відсотків', 'плюс', 'дорівнює'],
    same: { окей: 'ok', ок: 'ok' }
  },
  bn: {
    num: 'শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চোদ্দ চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ কুড়ি বিশ ত্রিশ চল্লিশ পঞ্চাশ ষাট সত্তর আশি নব্বই শত শো হাজার লাখ লক্ষ কোটি দশমিক',
    symbols: ['ডট', 'বিন্দু', 'কোলন', 'শতাংশ', 'প্লাস']
  },
  hi: {
    num: 'शून्य एक दो तीन चार पांच पाँच छह छः सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस तीस चालीस पचास साठ सत्तर अस्सी नब्बे सौ हज़ार हजार लाख करोड़ दशमलव',
    symbols: ['डॉट', 'बिंदु', 'कोलन', 'प्रतिशत', 'प्लस']
  },
  ur: {
    num: 'صفر ایک دو تین چار پانچ چھ سات آٹھ نو دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس بیس تیس چالیس پچاس ساٹھ ستر اسی نوے سو ہزار لاکھ کروڑ اعشاریہ',
    symbols: ['ڈاٹ', 'نقطہ', 'کولن', 'فیصد', 'جمع']
  },
  ar: {
    num: 'صفر واحد واحدة اثنان اثنين ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة عشر عشرون ثلاثون أربعون خمسون ستون سبعون ثمانون تسعون مئة مائة ألف مليون فاصلة',
    join: 'و',
    symbols: ['نقطة', 'نقطتان', 'بالمئة', 'زائد']
  }
};
// Chinese and Japanese are compared character by character; these characters write numbers.
const CJK_NUMERALS = '〇零一二三四五六七八九十百千万萬亿億两兩点點';
const CJK = /[぀-ヿ㐀-鿿豈-﫿]/u;

/** Case, compatibility forms, Arabic-script letter variants; accents are dropped except in Indic scripts. */
function fold(text, lang) {
  let s = String(text).normalize('NFKC').replace(/[’'`ʼ]/g, '');
  s = s.toLocaleLowerCase(lang === 'tr' || lang === 'az' ? 'tr' : lang || undefined);
  // Arabic script: one spelling per letter, so Urdu written with Arabic code points still matches.
  s = s.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[هۀة]/g, 'ہ').replace(/[أإآ]/g, 'ا').replace(/ـ/g, '');
  // Accents and harakat go (a recognizer is inconsistent with them); Indic vowel signs stay, they are letters.
  s = s.normalize('NFD').replace(/([^ऀ-෿\p{M}])\p{M}+/gu, '$1').normalize('NFC');
  return s.replace(/ı/g, 'i');
}

const cache = new Map();
function rules(lang) {
  const base = String(lang || 'en').toLowerCase().split('-')[0];
  if (cache.has(base)) return cache.get(base);
  const def = LANGS[base] || {};
  const pieces = new Set(words(fold(def.num || '', base)));
  const symbols = (def.symbols || []).map(phrase => words(fold(phrase, base))).sort((a, b) => b.length - a.length);
  const same = new Map(Object.entries(def.same || {}).map(([k, v]) => [fold(k, base), fold(v, base)]));
  const r = { base, pieces, join: new Set(words(fold(def.join || '', base))), symbols, same, cjk: base === 'zh' || base === 'ja' };
  cache.set(base, r);
  return r;
}

/** Does the word consist only of number pieces? ("dreiundzwanzig" = drei + und + zwanzig) */
function isNumberWord(word, pieces) {
  if (pieces.has(word)) return true;
  const ok = [true];
  for (let i = 1; i <= word.length; i++) {
    ok[i] = false;
    for (let j = Math.max(0, i - 16); j < i && !ok[i]; j++) if (ok[j] && pieces.has(word.slice(j, i)) && i - j >= 2) ok[i] = true;
  }
  return ok[word.length];
}

/**
 * Fold a sentence for comparison: lower case, no punctuation, no spoken symbols, every number run as
 * "#". Returns the tokens; `spoken(...).join('')` is what gets aligned.
 */
export function spoken(text, lang = 'en') {
  const r = rules(lang);
  let s = fold(text, r.base);
  // Punctuation and symbols separate words; a number's own separators (1.5, 192.168, 10:30) go too.
  s = s.replace(/[\p{P}\p{S}]+/gu, ' ');
  // Letters glued to digits ("g711", "mp3") are two words.
  s = s.replace(/(\p{Nd})(?=\p{L})|(\p{L})(?=\p{Nd})/gu, '$1$2 ');
  if (r.cjk) s = s.replace(new RegExp(`[\\p{Nd}${CJK_NUMERALS}]+`, 'gu'), ' # ');
  let tokens = words(s).map(t => r.same.get(t) || t);
  // Multi-word "same" entries ("o k" -> "ok").
  for (const [from, to] of r.same) if (from.includes(' ')) {
    const parts = from.split(' ');
    for (let i = 0; i + parts.length <= tokens.length; i++) if (parts.every((p, k) => tokens[i + k] === p)) tokens.splice(i, parts.length, to);
  }
  // Drop symbols read aloud, longest phrase first.
  for (const phrase of r.symbols) {
    for (let i = 0; i + phrase.length <= tokens.length;) {
      if (phrase.every((p, k) => tokens[i + k] === p)) tokens.splice(i, phrase.length); else i++;
    }
  }
  // A number with a suffix glued on ("dörtte", "দশটি", "14te" after its apostrophe goes) is the number, then the suffix.
  tokens = tokens.flatMap(t => {
    if (/^\p{Nd}/u.test(t) || isNumberWord(t, r.pieces)) return [t];
    const chars = [...t];
    for (let cut = chars.length - 1; cut >= Math.max(2, chars.length - 4); cut--) {
      const head = chars.slice(0, cut).join('');
      if (isNumberWord(head, r.pieces)) return [head, chars.slice(cut).join('')];
    }
    return [t];
  });
  const number = t => t === '#' || /^\p{Nd}+$/u.test(t) || isNumberWord(t, r.pieces);
  const out = [];
  for (const [i, t] of tokens.entries()) {
    const isNum = number(t) || (r.join.has(t) && out.at(-1) === '#' && tokens[i + 1] !== undefined && number(tokens[i + 1]));
    if (isNum) { if (out.at(-1) !== '#') out.push('#'); } else out.push(t);
  }
  return out;
}

/** Levenshtein alignment over code points, keeping the longest run of reference letters that were lost or garbled. */
function align(ref, hyp) {
  const a = [...ref], b = [...hyp], n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, (_, i) => { const row = new Uint32Array(m + 1); row[0] = i; return row; });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  // Walk back: count runs of deletions, and of deletions + substitutions, in the reference.
  let i = n, j = m, deleted = 0, damaged = 0, maxDeleted = 0, maxDamaged = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] === b[j - 1]) { deleted = 0; damaged = 0; } else { deleted = 0; damaged++; }
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { deleted++; damaged++; i--; }
    else { j--; continue; }
    maxDeleted = Math.max(maxDeleted, deleted); maxDamaged = Math.max(maxDamaged, damaged);
  }
  return { distance: d[n][m], maxDeleted, maxDamaged };
}

/**
 * How well did the voice say `reference`, judging by `heard`? Returns {ok, score, missing, garbled,
 * reference, heard} where score is the character error rate of the folded texts (0 is perfect),
 * `missing` the longest run of reference letters not heard at all and `garbled` the longest run lost or
 * replaced. A dropped or slurred word fails; recognizer spelling noise passes.
 */
export function compareSpeech(reference, heard, lang = 'en') {
  const r = rules(lang);
  const ref = spoken(reference, lang).join(''), hyp = spoken(heard, lang).join('');
  if (!ref.length) return { ok: true, score: 0, missing: 0, garbled: 0, reference: ref, heard: hyp };
  const { distance, maxDeleted, maxDamaged } = align(ref, hyp);
  const score = distance / [...ref].length;
  // Ideographs carry a word per character or two, so a shorter run already means a lost word.
  const limits = r.cjk ? { missing: 2, garbled: 3, score: 0.3 } : { missing: 3, garbled: 4, score: 0.25 };
  const ok = maxDeleted < limits.missing && maxDamaged < limits.garbled && score <= limits.score;
  return { ok, score: Number(score.toFixed(3)), missing: maxDeleted, garbled: maxDamaged, reference: ref, heard: hyp };
}

/** Languages with their own number and symbol words; the others still compare, with digits only. */
export const NORMALIZER_LANGS = [...Object.keys(LANGS), 'zh', 'ja'];
export const usesCjk = text => CJK.test(text);
