////////////////////////////////////////////////////////
// MCTC - magi's custom Twitch chat
// magiausde - 2023
////////////////////////////////////////////////////////


// \/ Things to fill out/configure \/
//
// You get these if you create/manage an app: https://dev.twitch.tv/console/apps/
APP_ID = '';
APP_SECRET = '';
//
// Set the channel to listen to (usually your channel!)
channel = "";
//
// Which users should be hidden (usually your bots)
// they must be lowercase!
const hideUsers = ['nightbot', 'hatbot', 'streamelements', 'moobot'];
//
// Censor specific words (will be replaced with *)
// not done yet!
//const censor = ['RandomWord1', 'AnotherWord2'];


///////////////////////////////////////////////////////
// DANGER AREA
// Only edit if you know what you are doing!
///////////////////////////////////////////////////////
// If the variables aren't filled yet (e.g. public web deployment),
//   get the values from the query
const urlParams = new URLSearchParams(window.location.search);
if (channel === "") {
    channel = urlParams.get('channel');
}
if (APP_ID === "") {
    APP_ID = urlParams.get('appid');
}
if (APP_SECRET === "") {
    APP_SECRET = urlParams.get('appsecret');
}

const username = undefined; 
token = undefined; // Will be requested later
broadcasterid = -1; // Will be looked up later (via ID)
badgeURLs = []; // contains the links to the badges
cheermotes = {}; // contains the cheermotes JSON

// Update Window/Tab title
document.title = 'MCTC | ' + channel;

// Create new twitch-js instance
const { Chat } = window.TwitchJs;

// HTML reference
const chatbar = document.getElementById("chatbar");

chatbar.innerHTML = "Starting up! This text should disappear soon. Please wait...";

function getHTMLSafeText(rawmsg) {
    // Prevent user XSS/HTML injection
    message = rawmsg.replaceAll('<3', '##HEART##'); // fix for <3 emote
    message = message.replaceAll('<', '&lt;');
    message = message.replaceAll('>', '&gt;');
    message = message.replaceAll('##HEART##', '<3'); // fix for <3 emote
    return message;
}

// Based on https://www.stefanjudis.com/blog/how-to-display-twitch-emotes-in-tmi-js-chat-messages/
// This function replaces text with the emote images (HTML)
function replaceStringEmotesWithHTML(message, emotes) {
    // If emotes aren't defined, we have nothing to do
    if (!emotes) return message;
  
    // Contains the string to be replaced with HTML
    // ['Kappa' => '<img ...></img>']
    const stringReplacements = [];
  
    // Go trough all emotes the message contains
    Object.entries(emotes).forEach(([index, data]) => {
        // start and end are the char positions of the emote text
      stringToReplace = message.substring(data.start, data.end+1);
  
      // Add replacement to array
      stringReplacements.push({
        stringToReplace: stringToReplace,
        replacement: `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${data.id}/default/dark/3.0">`,
      });
    });

    //console.info(stringReplacements);
  
    messageHTML = message;
    // Now, replace the strings with HTML
    stringReplacements.forEach((sr) => messageHTML = messageHTML.replaceAll(sr.stringToReplace, sr.replacement));
  
    return messageHTML;
}

async function retrieveAPIToken() {
    // Get a token from twitch to authenticate against the following API requests.
    chatbar.innerHTML = "<b>Logging in to API</b>";
    const responseAuth = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: "client_id=" + APP_ID + "&client_secret=" + APP_SECRET + "&grant_type=client_credentials"
        }
    );
    const authInfo = await responseAuth.json();
    token = authInfo.access_token;
}

async function fetchBroadcasterID() {
    // We need the user/broadcaster ID to get their badges, so look it up first
    chatbar.innerHTML = "<b>Getting broadcaster ID</b>";
    const responseI = await fetch("https://api.twitch.tv/helix/users?login=" + channel, {
        headers: {
            "Authorization": "Bearer " + token,
            "Client-Id": APP_ID
        }
    });
    const bdI = await responseI.json();
    broadcasterid = bdI.data[0].id;
    console.debug("Broadcaster ID is " + broadcasterid);
}

// loadBadges retrieves the badges (like sub, mod, vip, etc.)
// We get the badges and the links to the corresponding images, these will be stored in a key-value array/dict.
async function loadBadges() {
    // Global Badges
    chatbar.innerHTML = "<b>Loading global badge image URLs...</b>";
    const responseG = await fetch("https://api.twitch.tv/helix/chat/badges/global", {
        headers: {
            "Authorization": "Bearer " + token,
            "Client-Id": APP_ID
        }
    });
    const bdG = await responseG.json();

    bdG.data.forEach(set => {
        set.versions.forEach(version => {
            badgeURLs[set.set_id + "/" + version.id] = version.image_url_2x; // e.g. premium/1 => https://..
        });
    });

    // Channel Badges
    chatbar.innerHTML = "<b>Loading broadcaster badge image URLs...</b>";
    const responseC = await fetch("https://api.twitch.tv/helix/chat/badges?broadcaster_id=" + broadcasterid, {
        headers: {
            "Authorization": "Bearer " + token,
            "Client-Id": APP_ID
        }
    });
    const bdC = await responseC.json();

    bdC.data.forEach(set => {
        set.versions.forEach(version => {
            badgeURLs[set.set_id + "/" + version.id] = version.image_url_2x; // e.g. subscriber/3 => https://..
        });
    });
}

// loadCheermotes retrieves the global and channel-specific cheermotes
// We get the cheermotes - but as we need to do some checks later (min_bits etc.), we store the whole JSON response
async function loadCheermotes() {
    // According to the docs, if we specify a "broadcaster_id", it contains both global and channel specific cheermotes
    chatbar.innerHTML = "<b>Loading cheermote image URLs...</b>";
    const responseG = await fetch("https://api.twitch.tv/helix/bits/cheermotes?broadcaster_id=" + broadcasterid, {
        headers: {
            "Authorization": "Bearer " + token,
            "Client-Id": APP_ID
        }
    });
    cheermotes = await responseG.json();
    //console.debug(cheermotes);

    chatbar.innerHTML = "<b>Processing cheermotes...</b>";

    // Sort min_bits descending (so we can check what is the highest tier)
    // It looks like the "tier" array is already sorted ascending, but we should not rely on that!
    cheermotes.data.forEach(cm => {
        cm.tiers.sort((a, b) => {  
            return b.min_bits-a.min_bits;
          });
    });

    console.debug(cheermotes);
}

// This function takes a message object and returns HTML to show the badges for a user
function getBadgesForUserFromMessage(msg) {
    // We use RegEx to get the badge-details from the _raw-attribute
    // >> this is necessary, as twitch-js has a "badges"-attribute, but it does not contain the ".../level"

    // example: _raw: ...;badges=subscriber/3,premium/1;... 
    badges_raw = msg._raw.match("badges=(.*?);")[1]; // 1st capturing group

    if (typeof badges_raw[1] === 'undefined') { // If the 1st capturing group does not exist => the user doesn't have any badges
        return "";
    } else { // the user has some badges!
        // Split the string into an array, so we can go trough all badges
        badges = badges_raw.split(",");

        result = "";
        // For every badge, turn it into HTML code so the chatbar can display the corresponding badge image
        badges.forEach(badge => {
            result += '<img class="badge" src="' + badgeURLs[badge] + '"></img>';
        });

        return result;
    }
}

// Returns text/String!
// Info: Cheermotes are case insensitive! So cheer500 and Cheer500 must work
function replaceStringCheerWithHTML(msgobj) {
    msgtext = getHTMLSafeText(msgobj.message);

    // If the message does not include bits-info, just return the message text
    if (!msgobj.hasOwnProperty("bits")) {
        return msgtext;
    } else {
        cheermotes.data.forEach(cm => {
            // Search for occurances => loadCheer100 <= loadCheer = Prefix, 100 = Bits of cheermote
            pattern = cm.prefix + '(\\d+)';
            regex = RegExp(pattern, "i"); // case insensitive!

            while ( (cmr = regex.exec(msgtext)) ) {
                console.debug("Found " + cmr[0] + " in " + msgtext);
                partbits = cmr[1];

                // Now check which is the highest cheermote to use (partbits > min_bits)
                for (let tier of cm.tiers) {
                    if (partbits >= tier.min_bits) {
                        msgtext = msgtext.replaceAll(cmr[0], '<img class="cheermote" src="' + tier.images.dark.animated[3] + '"></img><span class="bits">' + cmr[1] + '</span>');
                        break;
                    }
                }
            }
        });

        return msgtext;
    }
}

const run = async () => {
    // Create new twitch-js Chat instance
  const chat = new Chat({
    username,
    APP_SECRET,
    log: { level: "warn" }
  });

  // chat.on is the event which gets fired whenever there is some activity in the chat.
  // This mustn't necessarily be a chat message, it could also be, e.g. a resub, ping or ban event.
  chat.on("*", (message) => {
    // Time the message/event was sent
    const time = new Date(message.timestamp).toLocaleTimeString();
    // The event itself (usually "PRIVMSG" - user chat message)
    const event = message.event || message.command;
    // username => all lowercase (e.g. nightbot) // displayName => e.g. NightBot
    const username = message.tags.displayName; // or message.username
    // the users chat color (if set, or else your preferred value)
    const usercolor = message.tags.color || "black"; // <== You can specify a default color if a user has not set one
    // "Real" message content, e.g. "Hello world! I'm magiausde"
    const msgtext = message.message || "";
    // Array of emotes this message contains
    const emotes = message.tags.emotes;
    // Check if the message is related to a custom reward (e.g. "submit your words")
    const isRewardMsg = message.tags.hasOwnProperty("customRewardId");
    // Check if it is a highlighted message
    const isHighlightedMsg = message.tags.hasOwnProperty("msgId") && (message.tags.msgId === "highlighted-message");
    console.debug("Is highlighted? " + isHighlightedMsg);

    // Debug stuff
    // Might spam your DevTools console if a lot is going on in chat.
    console.debug(`${time} - ${event} - ${username} - ${msgtext}`);
    console.debug(message);

    // Check if the message should be shown - START
    // Usually users' messages should be shown, but we will check if there is a condition where we don't want that
    allowMessage = true;

    // Is the event a user message?
    // > We will only show user messages in chat
    if ((event !== "PRIVMSG") && (event !== "CHEER")) { 
    //if ((event !== "CHEER")) { 
        allowMessage = false;
        console.debug("Event ain't chat message or cheer, ignoring");
    }

    // Is the message a command (like !shop)?
    // > Commands should not be displayed
    if (msgtext[0] === "!") {
        allowMessage = false;
        console.debug("Message seems to be a command, ignoring");        
    }

    // Is the message related to a reward (e.g. change your character)?
    // > Messages related to a reward should not spam the overlay chat
    if (isRewardMsg) {
        allowMessage = false;
        console.debug("Message relates to reward, ignoring");
    }

    // Shall the user be hidden (e.g. bot)?
    // > Bot messages should not spam the overlay chat
    if (hideUsers.includes(message.username)) {
        allowMessage = false;
        console.debug("Message is from hidden user '" + message.username + "', ignoring message");
    }
    // Check if the message should be shown - END

    // Is is still a message we would like to show? Yes? Then show it!
    if (allowMessage){
        chatbar.innerHTML = "<div style='vertical-align: middle;'><span id='badges'>" + getBadgesForUserFromMessage(message) + 
          "</span><span id='username' style='color: " + usercolor + ";'>" + username +
          "</span><span id='message'>" + replaceStringEmotesWithHTML(replaceStringCheerWithHTML(message), emotes) + "</span></div>";

        // Add css class if highlighted
        if (isHighlightedMsg) {
            document.getElementById("message").classList.add("highlighted");
        } else {
            document.getElementById("message").classList.remove("highlighted");
        }
    }
  });

  // These statements will be run whenever the chat-app starts.
  // Login first
  await retrieveAPIToken();
  // Get broadcaster ID
  await fetchBroadcasterID();
  // Load badges
  await loadBadges();
  // Load cheermotes
  await loadCheermotes();
  // Connect to chat server
  await chat.connect().then(globalUserState => {
    chatbar.innerHTML = "<b>Connected!</b> Joining channel...";
  });
  // Join channel chat
  await chat.join(channel).then(globalUserState => {
    chatbar.innerHTML = "<b>Joined channel '" + channel + "'!</b> New messages should appear here.";
  });
};

// Run the chat app!
run();

// EOF