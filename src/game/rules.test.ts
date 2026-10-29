import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wordToVisemes,
  buildVisemeTimeline,
  sampleLipSyncAtTime,
  estimateSpeechDuration,
  synthesizeExpressiveSpeechWavBase64,
} from './lipSyncEngine';
import {
  createInitialTomStats,
  applyCareAction,
  recordConversationTurn,
  computeVitalityPips,
  computeFriendshipLevel,
  getNextEnvironment,
  getNextTimeOfDay,
  getNext3DEffect,
  getNextRestMeow,
  detectUrduLanguage,
  project3DPoint,
  computeCharacter3DOffsets,
  computeCharacterLighting,
  enforceShortSpokenReply,
  generateDirectQuestionAnswer,
} from './tomState';

test('wordToVisemes maps vowels and bilabial consonants accurately', () => {
  const meow = wordToVisemes('Meow');
  assert.equal(meow[0], 'MBP');
  assert.ok(meow.includes('OH'));

  const fish = wordToVisemes('Fish');
  assert.equal(fish[0], 'FV');
  assert.ok(fish.includes('IH'));
});

test('buildVisemeTimeline produces contiguous cues matching spoken words', () => {
  const timeline = buildVisemeTimeline('Hello there friend!', 2.4);
  assert.equal(timeline.words.length, 3);
  assert.equal(timeline.totalDuration, 2.4);
  assert.ok(timeline.cues.length >= 6);
  assert.equal(timeline.cues[0].startTime, 0);
  const lastCue = timeline.cues[timeline.cues.length - 1];
  assert.ok(Math.abs(lastCue.endTime - 2.4) < 0.02);
});

test('sampleLipSyncAtTime interpolates jawOpen and blends audio bands', () => {
  const timeline = buildVisemeTimeline('Ma', 1.0);
  const sampleMid = sampleLipSyncAtTime(timeline, 0.45, {
    rms: 0.5,
    low: 0.6,
    mid: 0.4,
    high: 0.1,
  });
  assert.ok(sampleMid.params.jawOpen > 0.2);
  assert.equal(sampleMid.wordIndex, 0);

  const sampleAfter = sampleLipSyncAtTime(timeline, 2.0);
  assert.equal(sampleAfter.viseme, 'SIL');
  assert.equal(sampleAfter.params.jawOpen, 0);
});

test('synthesizeExpressiveSpeechWavBase64 generates valid RIFF WAV base64 audio', () => {
  const { wavBase64, durationSec } = synthesizeExpressiveSpeechWavBase64('Purr hello!', {
    durationSec: 0.8,
  });
  assert.equal(durationSec, 0.8);
  const buf = Buffer.from(wavBase64, 'base64');
  assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(buf.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.ok(buf.byteLength > 44);
});

test('applyCareAction and recordConversationTurn update Tom stats and friendship levels', () => {
  const initial = createInitialTomStats();
  const afterSalmon = applyCareAction(initial, 'feed_salmon');
  assert.ok(afterSalmon.stats.hunger > initial.hunger);
  assert.equal(afterSalmon.stats.treatsFed, 1);
  assert.equal(afterSalmon.emotion, 'excited');

  const afterChat = recordConversationTurn(afterSalmon.stats, 25);
  assert.equal(afterChat.conversationsCount, 1);
  assert.ok(afterChat.friendshipPoints > afterSalmon.stats.friendshipPoints);
  assert.equal(afterChat.friendshipLevel, computeFriendshipLevel(afterChat.friendshipPoints));

  const pips = computeVitalityPips(85);
  assert.deepEqual(pips, ['full', 'full', 'damaged']);
});

test('environment cycling and time-of-day character lighting parameters update accurately', () => {
  const env1 = getNextEnvironment('living_room');
  assert.equal(env1, 'bedroom');
  const env2 = getNextEnvironment(env1);
  assert.equal(env2, 'garden');
  assert.equal(getNextEnvironment(env2), 'living_room');

  const tod1 = getNextTimeOfDay('morning');
  assert.equal(tod1, 'day');

  const dayGardenLight = computeCharacterLighting('day', 'garden');
  const nightBedroomLight = computeCharacterLighting('night', 'bedroom');
  const sunsetLight = computeCharacterLighting('sunset', 'living_room');

  assert.ok(dayGardenLight.ambientBrightness > nightBedroomLight.ambientBrightness);
  assert.notEqual(dayGardenLight.furHighlightHex, sunsetLight.furHighlightHex);
  assert.notEqual(dayGardenLight.shadowOffsetX, sunsetLight.shadowOffsetX);
});

test('generateDirectQuestionAnswer answers questions directly in short words without repeating user input', () => {
  const mathAns = generateDirectQuestionAnswer('What is 15 * 4?');
  assert.ok(mathAns.reply.includes('60'));
  assert.ok(!mathAns.reply.includes('What is 15 * 4?'));
  assert.ok(mathAns.reply.split(/\s+/).length <= 18);

  const skyAns = generateDirectQuestionAnswer('Why is the sky blue?');
  assert.ok(skyAns.reply.toLowerCase().includes('scatter'));
  assert.ok(!skyAns.reply.includes('Why is the sky blue?'));
  assert.ok(skyAns.reply.split(/\s+/).length <= 18);

  const capitalAns = generateDirectQuestionAnswer('What is the capital of Japan?');
  assert.ok(capitalAns.reply.includes('Tokyo'));
  assert.ok(capitalAns.reply.split(/\s+/).length <= 18);
});

test('3D effect modes cycle and 3D perspective projection scales foreground objects larger than background', () => {
  const next3d = getNext3DEffect('cinema_depth');
  assert.equal(next3d, 'hologram_prism');
  assert.equal(getNext3DEffect(next3d), 'studio_spotlight');
  assert.equal(getNext3DEffect('studio_spotlight'), 'cinema_depth');

  const nearPt = project3DPoint(50, -20, 120, 640, 400, 0.1, -0.05);
  const farPt = project3DPoint(50, -20, -140, 640, 400, 0.1, -0.05);
  assert.ok(nearPt.scale > farPt.scale);
  assert.ok(nearPt.depthAlpha > farPt.depthAlpha);

  const offsets = computeCharacter3DOffsets(0.8, -0.5, 'hologram_prism');
  assert.ok(Math.abs(offsets.muzzleOffsetX) > Math.abs(offsets.headOffsetX));
  assert.ok(Math.sign(offsets.tailOffsetX) !== Math.sign(offsets.muzzleOffsetX));
});

test('enforceShortSpokenReply strictly limits answers to short words and estimateSpeechDuration gives relaxed timing', () => {
  const longText =
    'The cheetah is the fastest land animal on Earth, capable of reaching incredible speeds up to seventy miles per hour when sprinting across open grasslands in Africa.';
  const shortReply = enforceShortSpokenReply(longText, 16);
  const wordCount = shortReply.split(/\s+/).length;
  assert.ok(wordCount <= 16, `Expected <= 16 words, got ${wordCount}`);
  assert.ok(/[.!?]$/.test(shortReply));

  const dur = estimateSpeechDuration('The cheetah sprints up to 70 mph!');
  assert.ok(dur >= 3.2, `Expected relaxed duration >= 3.2s for 7 words, got ${dur}s`);
});

test('Urdu detection, Urdu Nastaliq viseme mapping, and rest-mode meow cycle work accurately', () => {
  assert.equal(detectUrduLanguage('Urdu men jawab sahi nahen deta'), true);
  assert.equal(detectUrduLanguage('Tumhara naam kya hai?'), true);
  assert.equal(detectUrduLanguage('تمہارا نام کیا ہے؟'), true);
  assert.equal(detectUrduLanguage('Why is the sky blue?'), false);

  const salamVisemes = wordToVisemes('سلام');
  assert.ok(salamVisemes.includes('LTH'));
  assert.ok(salamVisemes.includes('AA'));
  assert.ok(salamVisemes.includes('MBP'));

  const urduAns = generateDirectQuestionAnswer('Tumhara naam kya hai?');
  assert.ok(/[\u0600-\u06FF]/.test(urduAns.reply));
  assert.ok(urduAns.reply.includes('ٹام'));

  const m0 = getNextRestMeow(0);
  const m1 = getNextRestMeow(m0.nextIndex);
  assert.ok(m0.text.toLowerCase().includes('meow'));
  assert.notEqual(m0.text, m1.text);
});
