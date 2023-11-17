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
extEmotesURLs = []; // contains the links to the extension emotes
cheermotes = {}; // contains the cheermotes JSON
const mentionregex = /@\w+\s/gi;
currentmsgraw = ""; // Raw message text of currently shown message (needed for CLEARMSG)

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
function replaceStringEmotesWithHTML(msgobj) {
    const emotes = msgobj.tags.emotes;

    // If emotes aren't defined, we have nothing to do
    if (!emotes) return msgobj;

    // Contains the string to be replaced with HTML
    // ['Kappa' => '<img ...></img>']
    const stringReplacements = [];

    // Go trough all emotes the message contains
    Object.entries(emotes).forEach(([index, data]) => {
        // start and end are the char positions of the emote text
        stringToReplace = message.substring(data.start, data.end + 1);

        // Add replacement to array
        stringReplacements.push({
            stringToReplace: stringToReplace,
            replacement: `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${data.id}/default/dark/3.0"/>`,
        });
    });

    // Now, replace the strings with HTML
    stringReplacements.forEach((sr) => msgobj.message = msgobj.message.replaceAll(sr.stringToReplace, sr.replacement));

    return msgobj;
}

// This function replaces text with the extension emote images (HTML)
function replaceStringExtensionEmotesWithHTML(msgobj) {
    // Contains the string to be replaced with HTML
    // ['Kappa' => '<img ...></img>']
    const stringReplacements = [];

    // Go through all extension emotes the message might contain
    Object.entries(extEmotesURLs).forEach(([code, url]) => {
        // Replace plain text with HTML img code
        msgobj.message = msgobj.message.replaceAll(code, '<img class="emote" src="' + url + '"/>');
    });

    // Return the modified msgobj
    return msgobj;
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
            return b.min_bits - a.min_bits;
        });
    });

    console.debug(cheermotes);
}

// loadExtEmotes retrieves the global and channel-specific BTTV, FFZ and 7TV emotes
async function loadExtEmotes() {
    chatbar.innerHTML = "<b>Loading external emotes...</b>";

    // === FFZ ===
    chatbar.innerHTML = "<b>Loading external emotes (FFZ)...</b>";
    for (const scope of ['emotes/global', 'users/twitch/' + encodeURIComponent(broadcasterid)]) {
        //    ['emotes/global', 'users/twitch/' + encodeURIComponent(broadcasterid)].forEach(scope => {
        const response = await fetch("https://api.betterttv.net/3/cached/frankerfacez/" + scope);

        if (response.ok) {
            const bd = await response.json();

            bd.forEach(emote => {
                extEmotesURLs[emote.code] = emote.images["2x"];
            });
        }
    }

    // === BTTV global ===
    chatbar.innerHTML = "<b>Loading external emotes (BTTV global)...</b>";
    for (const scope of ['cached/emotes/global']) { // could be extended in the future
        const response = await fetch("https://api.betterttv.net/3/" + scope);

        if (response.ok) { // BTTV returns a 404 if a user isn't known
            const bd = await response.json();

            bd.forEach(emote => {
                if (emote.emote) {
                    emote = emote.emote;
                }
                console.debug(emote.code);
                extEmotesURLs[emote.code] = "https://cdn.betterttv.net/emote/" + emote.id + "/2x";
            });
        }
    }

    // === BTTV channel specific ===
    chatbar.innerHTML = "<b>Loading external emotes (BTTV channel specific)...</b>";
    for (const scope of ['cached/users/twitch/' + encodeURIComponent(broadcasterid)]) { // could be extended in the future
        const response = await fetch("https://api.betterttv.net/3/" + scope);

        if (response.ok) { // BTTV returns a 404 if a user isn't known
            const bd = await response.json();

            for (const emoteScope of [bd.channelEmotes, bd.sharedEmotes]) {
                if (emoteScope) {
                    emoteScope.forEach(emote => {
                        if (emote.emote) {
                            emote = emote.emote;
                        }
                        console.debug(emote.code);
                        extEmotesURLs[emote.code] = "https://cdn.betterttv.net/emote/" + emote.id + "/2x";
                    });
                }
            }

        }
    }

    // === 7TV ===
    chatbar.innerHTML = "<b>Loading external emotes (7TV)...</b>";
    for (const scope of ['users/' + encodeURIComponent(broadcasterid) + '/emotes']) {
        //    ['emotes/global', 'users/twitch/' + encodeURIComponent(broadcasterid)].forEach(scope => {
        const response = await fetch("https://7tv.io/v3/" + scope);

        if (response.ok) {
            const bd = await response.json();

            bd.forEach(emote => {
                extEmotesURLs[emote.code] = "https://cdn.betterttv.net/emote/" + emote.id + "/2x";
            });
        }
    }

    console.debug(extEmotesURLs);
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
    // If the message does not include bits-info, just return the message text
    if (!msgobj.hasOwnProperty("bits")) {
        return msgobj;
    } else {
        cheermotes.data.forEach(cm => {
            // Search for occurances => loadCheer100 <= loadCheer = Prefix, 100 = Bits of cheermote
            pattern = '\\b' + cm.prefix + '(\\d+)';
            regex = RegExp(pattern, "i"); // case insensitive!

            while ((cmr = regex.exec(msgobj.message))) {
                //console.debug("Found " + cmr[0] + " in " + msgobj.message);
                partbits = cmr[1];

                // Now check which is the highest cheermote to use (partbits > min_bits)
                for (let tier of cm.tiers) {
                    if (partbits >= tier.min_bits) {
                        msgobj.message = msgobj.message.replaceAll(cmr[0], '<img class="cheermote" src="' + tier.images.dark.animated[3] + '"/><span class="bits">' + cmr[1] + '</span>');
                        //console.debug(msgobj.message);
                        break;
                    }
                }
            }
        });

        return msgobj;
    }
}

// Checks if a message should be shown
function isMessageAllowed(msgobj) {
    // Usually users' messages should be shown, but we will check if there is a condition where we don't want that

    // Is the event a user message?
    // > We will only show user messages in chat
    if ((msgobj.event !== "PRIVMSG") && (msgobj.event !== "CHEER")) {
        console.debug("Event ain't chat message or cheer, ignoring");
        return false;
    }

    // Is the message a command (like !shop)?
    // > Commands should not be displayed
    if ((msgobj.message[0] || "") === "!") {
        console.debug("Message seems to be a command, ignoring");
        return false;
    }

    // Is the message related to a reward (e.g. change your character)?
    // > Messages related to a reward should not spam the overlay chat
    if (msgobj.tags.hasOwnProperty("customRewardId")) {
        console.debug("Message relates to reward, ignoring");
        return false;
    }

    // Shall the user be hidden (e.g. bot)?
    // > Bot messages should not spam the overlay chat
    if (hideUsers.includes(msgobj.username)) {
        console.debug("Message is from hidden user '" + msgobj.username + "', ignoring message");
        return false;
    }

    // Message seems to be allowed!
    return true;
}

function convertMentionsCSS(msgobj) {
    // The check is cheaper in terms of computing power than doing the RegEx all the time.
    // So only do it, if necessary.
    if (msgobj.message.includes("@")) {
        msgobj.message = msgobj.message.replace(mentionregex, '<span class="mention">$&</span>');
    }

    return msgobj;
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
    chat.on("*", (msgobj) => {
        // Time the message/event was sent
        const time = new Date(msgobj.timestamp).toLocaleTimeString();
        // The event itself (usually "PRIVMSG" - user chat message)
        const event = msgobj.event || mesmsgobjsage.command;
        // username => all lowercase (e.g. nightbot) // displayName => e.g. NightBot
        const username = msgobj.tags.displayName; // or message.username
        // the users chat color (if set, or else your preferred value)
        const usercolor = msgobj.tags.color || "aqua"; // <== You can specify a default color if a user has not set one
        // "Real" message content, e.g. "Hello world! I'm magiausde"
        const msgtext = msgobj.message || "";
        // Check if it is a highlighted message
        const isHighlightedMsg = msgobj.tags.hasOwnProperty("msgId") && (msgobj.tags.msgId === "highlighted-message");

        // Debug stuff
        // Might spam your DevTools console if a lot is going on in chat.
        console.debug(`${time} - ${event} - ${username} - ${msgtext}`);
        console.debug(msgobj);

        if ((event === "CLEARMSG") && (msgtext === currentmsgraw)) {
            chatbar.innerHTML = "<div style='vertical-align: middle;'><span id='message'>\
        <img class='emote' src='https://static-cdn.jtvnw.net/emoticons/v2/emotesv2_b0c6ccb3b12b4f99a9cc83af365a09f1/default/dark/3.0'>\
        &nbsp;This message has been deleted!&nbsp;<img class='emote' src='https://static-cdn.jtvnw.net/emoticons/v2/81103/default/dark/3.0'></span></div>";
        } else {
            // Is is still a message we would like to show? Yes? Then show it!
            if (isMessageAllowed(msgobj)) {
                // First, make sure that users don't inject HTML
                msgobj.message = getHTMLSafeText(msgobj.message);

                htmlmsg = convertMentionsCSS(replaceStringExtensionEmotesWithHTML(replaceStringCheerWithHTML(replaceStringEmotesWithHTML(msgobj)))).message;
                //console.log(htmlmsg);

                chatbar.innerHTML = "<div style='vertical-align: middle;'><span id='badges'>" + getBadgesForUserFromMessage(msgobj) +
                    "</span><span id='username' style='color: " + usercolor + ";'>" + username +
                    "</span><span id='message'>" + htmlmsg + "</span></div>";

                // Add css class if highlighted
                if (isHighlightedMsg) {
                    document.getElementById("message").classList.add("highlighted");
                } else {
                    document.getElementById("message").classList.remove("highlighted");
                }

                currentmsgraw = msgtext;
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
    // Load extension emotes
    await loadExtEmotes();
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