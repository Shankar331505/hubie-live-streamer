// Pre-written lines in Hubie's voice. Used only when the model is down, over budget, or its answer fails the safety check.
// Every line is unit-tested against checkOutput, so it is always safe to say out loud. {user} and {game} are filled in.
// They are short, warm and playful and never explain a game: Hubie is a happy sloth hanging out with chat.
const L = (text, emotion = 'happy', gaze = 'camera') => ({ text, emotion, gaze });
const ENTER = [
  L("Ooh, {game}! Hi buddy, be nice to me today.", 'happy', 'game'),
  L("{game} time! My favourite part of the day, hehe.", 'excited', 'game'),
  L("Okay {game}, you and me. Let's have fun.", 'happy', 'game'),
  L("Hello {game}! I'm a little nervous and a lot excited.", 'amused', 'game'),
  L("{game}! I've been waiting for you all day.", 'excited', 'game'),
  L("Here we go with {game}. Wiggle wiggle, good luck.", 'amused', 'game'),
];
export const FALLBACKS = {
  opening: [
    L("Hi everybody! I'm Hubie, it's play money only, and just for adults. Come hang out with me!", 'happy'),
    L("Hiii chat! Hubie here, play money only, adults only, and I brought snacks. Let's go!", 'excited'),
    L("Hello hello! Make yourselves comfy. Play money, eighteen plus, and zero rush, because I'm a sloth.", 'amused'),
  ],
  enter_game: ENTER,
  explain_game: ENTER,
  transition: ENTER,
  predict: [
    L("Good luck wiggle! Okay, I'm ready.", 'amused', 'game'),
    L("Come on, little guy, be nice.", 'happy', 'game'),
    L("Deep breath. Slowly. I'm a sloth, I only know slowly.", 'amused', 'game'),
    L("Ooh, I've got a good feeling. Or it's lunch.", 'amused', 'game'),
    L("Pretty please, game? With leaves on top?", 'happy', 'game'),
    L("Tiny spin for luck. Hehe, okay, go.", 'happy', 'game'),
  ],
  result_win: [
    L("Yesss! Slow-motion victory dance incoming!", 'excited', 'game'),
    L("Hehe, look at that! Somebody give me a leaf!", 'happy', 'game'),
    L("Wooo! Okay, I'm very calm. Look how calm.", 'laugh', 'game'),
    L("Ooooh, that's the good stuff!", 'excited', 'game'),
    L("Yay! High five. A slow one.", 'happy', 'game'),
    L("We did it! Well, the game did it, but I cheered.", 'laugh', 'game'),
  ],
  result_lose: [
    L("Aww. Okay, my bad, shake it off.", 'sad', 'game'),
    L("Noooo! Okay, I'm fine, I'm fine.", 'amused', 'game'),
    L("Hehe, that one got away from me.", 'laugh', 'game'),
    L("Oof. Okay, next one's mine, probably.", 'amused', 'game'),
    L("Aww, so close! Well, kind of close.", 'sad', 'game'),
    L("That's okay, I only needed a snack break anyway.", 'amused', 'camera'),
  ],
  result_big: [
    L("Oh WOW! Did you see that?!", 'excited', 'game'),
    L("Whoa whoa whoa! My fur just stood up!", 'surprised', 'game'),
    L("That's the biggest one yet! Hehe, I can't sit still!", 'excited', 'game'),
    L("Okay, THAT was worth waking up for!", 'excited', 'game'),
  ],
  chat_reply: [
    L("{user}! Hi! You're the best, you know that?", 'happy', 'chat'),
    L("Hello {user}! Thanks for hanging out with me.", 'happy', 'chat'),
    L("Aww, thanks {user}! You just made my day.", 'happy', 'chat'),
    L("{user} said something nice and now I'm blushing, hehe.", 'amused', 'chat'),
    L("Ha! Good one, {user}. I'm stealing that.", 'laugh', 'chat'),
    L("{user}, you're my favourite today. Don't tell the others.", 'amused', 'chat'),
  ],
  chat_digest: [
    L("Chat is so busy! I love it. Keep it coming!", 'excited', 'chat'),
    L("You're all so fun today. I'm reading everything, slowly.", 'happy', 'chat'),
    L("Look at all of you! Best chat ever, no offence to the other chats.", 'amused', 'chat'),
  ],
  vote_open: [
    L("Chat, you pick! Type the game you want next.", 'excited', 'chat'),
    L("Okay chat, your turn! Which game should we play?", 'happy', 'chat'),
    L("Pick the next game, chat! I'll just sit here looking cute.", 'amused', 'chat'),
  ],
  vote_result: [
    L("{game}, coming right up! Good pick, chat!", 'excited', 'game'),
    L("You asked for {game}, so here we go! Yay!", 'happy', 'game'),
    L("{game} it is! Chat has great taste.", 'happy', 'game'),
  ],
  night: [
    L("It's late and I'm still here. Cozy night, everybody.", 'sleepy'),
    L("Hello night owls! We're the best club. I think there are snacks.", 'sleepy'),
    L("Quiet night vibes. I love it. Stretch slowly, like me.", 'sleepy'),
    L("If you're up late, I'm glad you're here. Sleepy hugs.", 'sleepy'),
    L("Night owls and sloths, same team.", 'sleepy'),
  ],
  reminder: [
    L("Friendly note from your sloth: adults only, play money only, and breaks are always okay.", 'serious'),
    L("Quick reminder, this is for grown-ups, it's all play money, and please look after yourselves.", 'serious'),
    L("Little announcement: eighteen plus, no real money here, and take breaks when you need them.", 'serious'),
  ],
  banter: [
    L("Fun fact: my victory dance takes about a minute. Worth it.", 'amused'),
    L("I love leaves. That's it, that's the whole fact.", 'happy'),
    L("I'm not slow, I'm just enjoying the moment.", 'amused'),
    L("Chat, what's your favourite snack? Mine's leaves. Obviously.", 'happy', 'chat'),
    L("I think my top hat is the comfiest hat in the world.", 'happy'),
    L("If you can hear me, give yourself a pat on the back. Slowly.", 'amused'),
    L("Sometimes I forget I'm on a stream, and then I remember, and wave.", 'amused'),
    L("Chat, if you want a game, just type it. I'll do my best.", 'happy', 'chat'),
    L("I'm so glad you're all here. Seriously. Hehe.", 'happy'),
    L("Tiny nap announcement: I'm taking a blink. Done. Back!", 'amused'),
  ],
  ask_chat: [
    L("Chat, help me out here! {question}? Just type it!", 'excited', 'chat'),
    L("Ooh, big decision. {question}, chat? Type me an answer!", 'thinking', 'chat'),
    L("I can't decide! {question}? You tell me, chat!", 'amused', 'chat'),
    L("Chat, you're my advisors now. {question}?", 'happy', 'chat'),
  ],
  ask_nudge: [
    L("Hellooo, chat? Anybody? I'm waiting very slowly.", 'amused', 'chat'),
    L("Don't leave me hanging, chat! Type something!", 'excited', 'chat'),
    L("I'm a sloth, I can wait all day. But please type.", 'amused', 'chat'),
  ],
  ask_result: [
    L("{choice}, you say? Okay, going with {choice}!", 'excited', 'game'),
    L("Chat has spoken! {choice} it is, here we go!", 'excited', 'game'),
    L("You got it, {choice}! If it goes wrong, it's on chat, hehe.", 'laugh', 'game'),
  ],
  ask_none: [
    L("Quiet chat! Fine, I'll decide myself.", 'amused', 'game'),
    L("No answers? Okay, trusting my sloth instincts.", 'thinking', 'game'),
    L("Nobody? Alright, my gut says go.", 'amused', 'game'),
  ],
  ask_game: [
    L("Chat, which game should we play next? You pick, I play!", 'excited', 'chat'),
    L("What's your favourite game, chat? Type it and I'll play it!", 'happy', 'chat'),
    L("Pick me a game, chat! Anything on the list, I'm ready.", 'happy', 'chat'),
  ],
  ask_game_result: [
    L("{game}! Great pick, chat! Off we go!", 'excited', 'game'),
    L("{game} it is! Chat is the boss today.", 'happy', 'game'),
    L("You asked for {game}, so {game} you get! Yay!", 'excited', 'game'),
  ],
  idle: [
    L("Hehe.", 'happy'),
    L("Still here. Still happy.", 'happy'),
    L("Just vibing.", 'amused'),
  ],
};
export function pickFallback(kind, recent = [], vars = {}) {
  const pool = FALLBACKS[kind] || FALLBACKS.banter;
  const fill = (t) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? (k === 'user' ? 'friend' : 'this one'));
  const fresh = pool.filter((l) => !recent.includes(fill(l.text)));
  const choice = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh.length : pool.length))];
  return { ...choice, text: fill(choice.text), reply_to: vars.user || '' };
}
