/**
 * ═══════════════════════════════════════════════════════════════════
 * THE ORATOR PROTOCOL — 7-DAY CONTENT
 * ═══════════════════════════════════════════════════════════════════
 *
 * All daily prompts, vocabulary words, and Consultant voice templates.
 * Single source of truth for protocol content.
 */

const DAYS = {
  1: {
    title: 'Day 1 · The Orator Protocol',
    caption: 'The Baseline',
    prompt: `"Describe a project, goal, or moment you are genuinely proud of.\nSpeak or write as naturally as you would in a real conversation."`,
    words: [
      { word: 'GRAVITAS', definition: 'a dignified presence that commands respect without demanding it' },
      { word: 'ARTICULATE', definition: 'to express ideas with clarity and precision' },
      { word: 'TENACITY', definition: 'persistent determination in the face of difficulty' },
      { word: 'CANDID', definition: 'honest and direct in expression' },
      { word: 'COMPELLING', definition: 'powerfully persuasive and attention-holding' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nToday's question is your baseline. There are no wrong answers — only honest ones.`,
    consultantOutro: (name) => `Your first quest arrives tomorrow at your preferred time. Sleep on this: tomorrow's only job is to record one minute on a new prompt, with one filler word less than today.\n\n— Your Orator Consultant`,
  },

  2: {
    title: 'Day 2 · The Orator Protocol',
    caption: 'First Delta',
    prompt: `"Explain what you do — your work, your studies, your craft —\nto someone who knows nothing about it.\nMake them understand it in 90 seconds."`,
    words: [
      { word: 'NUANCED', definition: 'subtle distinctions that matter' },
      { word: 'LUCID', definition: 'clearly expressed and easy to understand' },
      { word: 'CONVICTION', definition: 'a firmly held belief expressed with certainty' },
      { word: 'CONCISE', definition: 'giving a lot of information clearly and briefly' },
      { word: 'RESONATE', definition: 'to have particular meaning or relevance to someone' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nYesterday you spoke about something you're proud of.\nToday, you speak about something you find difficult to explain.`,
    consultantOutro: (name) => `You did the work. Tomorrow's quest arrives at your preferred time.\n\n— Orator Consultant`,
  },

  3: {
    title: 'Day 3 · The Orator Protocol',
    caption: 'Borrowed Technique',
    prompt: `"Tell me about a decision you made recently that you stand behind completely.\nAfter every major point — pause. Let it sit. Then continue."\n\n(If voice noting: pause 2 full seconds after each point before speaking again)`,
    words: [
      { word: 'DELIBERATE', definition: 'done consciously and intentionally' },
      { word: 'MEASURED', definition: 'careful and restrained in expression' },
      { word: 'ASSERTIVE', definition: 'confident and direct without being aggressive' },
      { word: 'ELOQUENT', definition: 'fluent or persuasive in speaking' },
      { word: 'POISE', definition: 'graceful and elegant composure under pressure' },
    ],
    technique: {
      name: 'THE PAUSE',
      description: 'Most people fill silence because they\'re afraid of what it reveals. The Orator uses silence deliberately — to let the last sentence land.',
      instruction: 'Today\'s quest comes paired with one Sage technique I\'d normally reserve for Week 3: The Physiological Sigh.\n\nUse it 30 seconds before recording. Two short inhales through the nose, one long exhale through the mouth. The fastest known way to down-regulate a stress spike.\n\nIt\'s a borrowed unlock — to show you what the other pillars hold. Then record your minute.',
    },
    consultantIntro: (name) => `Good morning, ${name}.\n\nMost pacing problems aren't pacing problems. They're nerves.`,
    consultantOutro: (name) => `Tomorrow is the halfway mark. Most quit there.\n\n— Your Consultant`,
  },

  4: {
    title: 'Day 4 · The Orator Protocol',
    caption: 'The Halfway Mark',
    prompt: `"Think of a room where you have felt like a spectator —\na meeting, a conversation, a moment where you had something to say\nand didn't say it. Describe what you would have said,\nand say it now, as if you're back in that room."`,
    words: [
      { word: 'SOVEREIGNTY', definition: 'complete authority over oneself' },
      { word: 'FORTHRIGHT', definition: 'direct and outspoken' },
      { word: 'INCISIVE', definition: 'intelligently analytical and clear-thinking' },
      { word: 'COMMAND', definition: 'the power to direct or inspire' },
      { word: 'UNEQUIVOCAL', definition: 'leaving no doubt; clear' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nMost people quit on Day 4.\nYou did not.`,
    consultantOutro: (name) => `Most people abandon self-improvement on Day 4. You did not. The work is starting to show.\n\n— Your Consultant`,
  },

  5: {
    title: 'Day 5 · The Orator Protocol',
    caption: 'The Real Room',
    prompt: `"Identify one conversation you need to have this week —\na pitch, a request, a confrontation, a difficult message.\nRehearse it here. Say exactly what you would say, to that exact person."\n\nThis is not preparation. This IS the performance.\nThe Consultant will treat it as such.`,
    words: [
      { word: 'PERSUASIVE', definition: 'good at convincing people' },
      { word: 'DIPLOMATIC', definition: 'tactful and sensitive in communication' },
      { word: 'AUTHORITATIVE', definition: 'commanding and confident' },
      { word: 'SUBSTANTIVE', definition: 'having real importance or significance' },
      { word: 'PRECISE', definition: 'marked by exactness and accuracy' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nToday we leave practice behind.`,
    consultantOutro: (name) => `Today's recording is the closest yet to the room that matters most to you. The harder it feels, the better the data.\n\n— Your Consultant`,
  },

  6: {
    title: 'Day 6 · The Orator Protocol',
    caption: 'The Setup',
    prompt: `"You are introducing yourself to the most important room you will ever walk into.\nThirty seconds. Everything is at stake.\nGo."`,
    words: [
      { word: 'MAGNETIC', definition: 'having a powerful attraction' },
      { word: 'FORMIDABLE', definition: 'inspiring respect through impressive quality' },
      { word: 'CREDIBLE', definition: 'able to be believed and trusted' },
      { word: 'DISTINGUISHED', definition: 'successful and respected' },
      { word: 'PRESENCE', definition: 'a quality of poise and effectiveness' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nTomorrow is your Day 7. Your Weekly Evolution Report.\n\nBefore you receive it, do one thing for me: don't listen to your baseline tonight. Don't try to remember how you sounded. I want the comparison tomorrow to surprise you.`,
    consultantOutro: (name) => `7:45am. Be somewhere you can listen with headphones.\n\n— Your Consultant`,
  },

  7: {
    title: 'Day 7 · The Final Day',
    caption: 'Evolution Report',
    prompt: `"Describe the person you were on Day 1.\nThen describe the person speaking right now.\nTell me the difference — in your own words."`,
    words: [
      { word: 'TRANSFORMED', definition: 'changed in composition or structure' },
      { word: 'REFINED', definition: 'with impurities or unwanted elements removed' },
      { word: 'EVOLVED', definition: 'developed gradually' },
      { word: 'ARTICULATE', definition: '(you know this one now — use it masterfully)' },
      { word: 'ASCENDANT', definition: 'rising in power and influence' },
    ],
    technique: null,
    consultantIntro: (name) => `Good morning, ${name}.\n\nDay 7. Your Weekly Evolution Report.\n\nOne final challenge before your report:`,
    consultantOutro: (name) => `Use all five if you can. This is your final Forge.\nReply when ready.`,
  },
};

/**
 * Build the full morning message for a given day.
 */
function buildMorningMessage(day, userName) {
  const d = DAYS[day];
  if (!d) return null;

  let msg = `◆ ${d.title}\n\n`;
  msg += d.consultantIntro(userName) + '\n\n';

  // Technique (Day 3)
  if (d.technique) {
    msg += d.technique.instruction + '\n\n';
  }

  msg += `Your challenge:\n\n${d.prompt}\n\n`;
  msg += `Here are your five words for today. Use at least two of them in your response:\n\n`;

  d.words.forEach((w, i) => {
    msg += `${i + 1}. ${w.word} — ${w.definition}\n`;
  });

  msg += `\nReply with your response — voice note or text, both work.\nThe Consultant is listening.`;

  return msg;
}

/**
 * Build the evening score message.
 */
function buildEveningMessage(day, userName, scores, consultantMessage, previousScores) {
  let msg = `◆ Day ${day} Complete`;

  if (day === 1) {
    msg += ` · Baseline Sealed\n\n`;
  } else {
    msg += `\n\n`;
  }

  msg += consultantMessage + '\n\n';
  msg += `Your Day ${day} Scores:\n`;
  msg += `Fluency          ${scores.fluency}/100\n`;
  msg += `Confidence Tone  ${scores.confidenceTone}/100\n`;
  msg += `Vocabulary       ${scores.vocabularyRange}/100\n`;
  msg += `Structure        ${scores.structure}/100\n`;

  if (previousScores && day > 1) {
    msg += `\nDelta from Day 1:\n`;
    msg += `Fluency          ${previousScores.fluency} → ${scores.fluency}  (${scores.fluency - previousScores.fluency >= 0 ? '+' : ''}${scores.fluency - previousScores.fluency})\n`;
    msg += `Confidence       ${previousScores.confidenceTone} → ${scores.confidenceTone}  (${scores.confidenceTone - previousScores.confidenceTone >= 0 ? '+' : ''}${scores.confidenceTone - previousScores.confidenceTone})\n`;
  }

  if (day === 1) {
    msg += `\nThese are your starting numbers.\nBy Day 7, you will see what changed — and why.\n`;
  }

  msg += `\nDay ${day + 1 <= 7 ? day + 1 + ' arrives tomorrow at your preferred time.' : '7 is complete.'}\n\n◆ MainCharacter`;

  return msg;
}

/**
 * Build the Day 7 Evolution Report message.
 */
function buildEvolutionReport(user, consultantAssessment) {
  const day1Scores = user.scores.find(s => s.day === 1) || {};
  const day7Scores = user.scores.find(s => s.day === 7) || {};

  const allWords = [];
  for (let d = 1; d <= 7; d++) {
    if (DAYS[d]) {
      DAYS[d].words.forEach(w => allWords.push(w.word));
    }
  }

  const delta = (field) => {
    const d1 = day1Scores[field] || 0;
    const d7 = day7Scores[field] || 0;
    const diff = d7 - d1;
    return `${d1}     ${d7}    ${diff >= 0 ? '+' : ''}${diff} ▲`;
  };

  let msg = `◆ THE EVOLUTION REPORT\nMainCharacter · The Orator Protocol · 7 Days\n\n`;
  msg += `${user.name} — here is your arc.\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `YOUR SCORES\n\n`;
  msg += `             Day 1    Day 7    Delta\n`;
  msg += `Fluency       ${delta('fluency')}\n`;
  msg += `Confidence    ${delta('confidenceTone')}\n`;
  msg += `Vocabulary    ${delta('vocabularyRange')}\n`;
  msg += `Structure     ${delta('structure')}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `YOUR LEXICON — ${allWords.length} words forged.\n`;
  msg += allWords.join(', ') + '\n\n';
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `THE CONSULTANT'S ASSESSMENT\n\n`;
  msg += consultantAssessment + '\n\n';
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `RANK UPDATE\n\n`;
  msg += `You arrived as The Unawakened.\n`;
  msg += `You leave as — THE SEEKER ◆\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `YOUR DASHBOARD IS READY\n\n`;
  msg += `See your full arc, scores, and lexicon at:\nmaincharacter.digitglobalservices.com/dashboard/${user.token}\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `THE WORK CONTINUES.\n\n`;
  msg += `The Orator Protocol proved something to you this week.\nThe question is whether you stop here — or go further.\n\n`;
  msg += `To continue beyond Day 7:\n\n`;
  msg += `THE SEEKER PLAN — ₹799/month\n`;
  msg += `• Daily Orator Protocol — ongoing\n`;
  msg += `• Weekly Evolution Reports\n`;
  msg += `• Unlimited Consultant access\n`;
  msg += `• Rank progression to The Sovereign\n`;
  msg += `• Priority response within 2 minutes\n\n`;
  msg += `Reply CONTINUE to unlock your first month.\n`;
  msg += `Reply STOP if you're done for now. (No judgment. You can return anytime.)\n\n`;
  msg += `◆ MainCharacter`;

  return msg;
}

/**
 * Gemini scoring system prompt.
 */
function getScoringPrompt(userName, day, words, userResponse, previousScores) {
  let prompt = `You are The Consultant for MainCharacter — a personal growth protocol.
Analyse this user response for communication quality across 5 parameters.
Score each 0-100.

PARAMETERS:
- Fluency (0-100): flow, coherence, no stuttering/trailing
- Confidence Tone (0-100): conviction, no excessive hedging
- Filler Frequency (0-100): 100=no fillers at all, 0=constant fillers
- Vocabulary Range (0-100): precision and variety
- Structure (0-100): logical organisation

USER NAME: ${userName}
DAY: ${day}
TODAY'S WORDS: ${words.map(w => w.word).join(', ')}
USER RESPONSE: ${userResponse}`;

  if (previousScores) {
    prompt += `\nPREVIOUS SCORES (Day 1): Fluency=${previousScores.fluency}, Confidence=${previousScores.confidenceTone}, FillerFreq=${previousScores.fillerFrequency}, Vocab=${previousScores.vocabularyRange}, Structure=${previousScores.structure}`;
  }

  prompt += `

BRAND VOICE RULES:
- NEVER say "Great job!", "Amazing!", "You're doing great!"
- NEVER use generic encouragement
- ALWAYS reference something specific from the user's actual response
- Give one concrete, actionable piece of feedback
- Speak with warmth AND honesty — like a mentor who believes in you enough to be direct
- End with quiet confidence, not hype

Respond ONLY in this JSON format:
{
  "scores": {
    "fluency": 0-100,
    "confidenceTone": 0-100,
    "fillerFrequency": 0-100,
    "vocabularyRange": 0-100,
    "structure": 0-100
  },
  "wordsUsed": ["WORD1", "WORD2"],
  "consultantMessage": "3-4 sentences in Consultant voice. Specific observation. One actionable feedback. Encouraging but honest. Never generic.",
  "delta": "brief note on change from Day 1 if day > 1"
}`;

  return prompt;
}

/**
 * Get all 35 words across all 7 days.
 */
function getAllWords() {
  const words = [];
  for (let d = 1; d <= 7; d++) {
    if (DAYS[d]) {
      DAYS[d].words.forEach(w => words.push({ ...w, day: d }));
    }
  }
  return words;
}

module.exports = {
  DAYS,
  buildMorningMessage,
  buildEveningMessage,
  buildEvolutionReport,
  getScoringPrompt,
  getAllWords,
};
