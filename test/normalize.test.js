import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSpeech, spoken, NORMALIZER_LANGS } from '../lib/normalize.mjs';
import { takeText, better, judge } from '../lib/listen.mjs';
import { VOICES } from '../lib/voices.mjs';

const pass = (lang, said, heard) => assert.ok(compareSpeech(said, heard, lang).ok, `${lang}: "${said}" vs "${heard}" ${JSON.stringify(compareSpeech(said, heard, lang))}`);
const fail = (lang, said, heard) => assert.ok(!compareSpeech(said, heard, lang).ok, `${lang}: "${said}" vs "${heard}" should fail`);

test('every installable voice language has number and symbol words', () => {
  for (const voice of VOICES) assert.ok(NORMALIZER_LANGS.includes(voice.lang), voice.lang);
});

test('numbers, symbols and spelling noise are not counted as voice errors', () => {
  pass('en', 'He picks up, his phone sends two hundred OK.', 'He picks up, his phone sends 200 okay.');
  pass('en', 'Like one nine two, one six eight, one, ten.', 'Like 192.168.110.');
  pass('en', 'My codecs, like G seven eleven or Opus.', 'My codex, like G711 or Opus.');
  pass('en', 'sip colon alice at example dot com', 'sip:alice@example.com');
  pass('tr', 'Yüzde elli indirim, saat on dörtte başlıyor.', "%50 indirim, saat 14'te başlıyor.");
  pass('tr', 'İki yüz OK cevabı gelir.', '200 okey cevabı gelir.');
  pass('de', 'Dreiundzwanzig Telefone sind online.', '23 Telefone sind online.');
  pass('fr', 'Quatre-vingt-dix appels par jour.', '90 appels par jour.');
  pass('es', 'Veintitrés llamadas al día.', '23 llamadas al dia.');
  pass('it', 'Ventitré chiamate al giorno.', '23 chiamate al giorno.');
  pass('pt', 'Duzentos telefones, ponto com.', '200 telefones .com');
  pass('ru', 'Двести телефонов, точка ру.', '200 телефонов .ру');
  pass('uk', "П'ятсот дзвінків на день.", '500 дзвінків на день.');
  pass('bn', 'আমার কাছে দশটি ফোন আছে।', 'আমার কাছে ১০টি ফোন আছে।');
  pass('hi', 'मेरे पास दस फ़ोन हैं।', 'मेरे पास 10 फ़ोन हैं।');
  pass('ur', 'میرے پاس دس فون ہیں۔', 'ميرے پاس 10 فون هيں');
  pass('zh', '我有三部电话。', '我有3部电话。');
  pass('ja', '電話が三台あります。', '電話が3台あります。');
});

test('dropped, cut and slurred words are caught', () => {
  fail('en', 'You dial a colleague from your desk phone.', 'dial a colleague from your desk phone.');
  fail('en', 'A hard phone is a physical desk phone.', 'A hard phone is a phys phone.');
  fail('en', 'SUBSCRIBE keeps everyone informed.', 'Subscribe everyone informed.');
  fail('tr', 'Sabit telefon masanın üstünde durur.', 'Sabit masanın üstünde durur.');
  fail('de', 'Dreiundzwanzig Telefone sind online.', '23 sind online.');
  fail('ru', 'Телефон звонит каждый день.', 'Телефон каждый день.');
  fail('zh', '我有三部电话。', '我电话。');
  fail('en', 'The call connects.', '');
});

test('folding: Turkish casing, Arabic-script variants, Indic vowel signs kept', () => {
  assert.deepEqual(spoken('İSTANBUL ışık', 'tr'), ['istanbul', 'isik']);
  assert.deepEqual(spoken('ميرے', 'ur'), spoken('میرے', 'ur'));
  assert.notDeepEqual(spoken('কি', 'bn'), spoken('ক', 'bn'));
});

test('retakes: commas outside numbers go only when the engine cannot vary on its own, and better takes win', () => {
  assert.equal(takeText('sip, colon, alice, 1,000 calls', 0, true), 'sip, colon, alice, 1,000 calls');
  assert.equal(takeText('sip, colon, alice, 1,000 calls', 1, true), 'sip, colon, alice, 1,000 calls');
  assert.equal(takeText('sip, colon, alice, 1,000 calls', 2, true), 'sip colon alice 1,000 calls');
  assert.equal(takeText('sip, colon', 1, false), 'sip colon');
  const v = { lang: 'en', check: { model: 'small' } };
  const bad = judge('A hard phone is a physical desk phone.', 'A hard phone is a phys phone.', v);
  const good = judge('A hard phone is a physical desk phone.', 'A hard phone is a physical desk phone.', v, 1);
  assert.ok(better(good, bad) && !better(bad, good) && !bad.ok && good.ok);
});
