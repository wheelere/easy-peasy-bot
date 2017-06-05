/**
 * A Bot for Slack!
 */


/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */

if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});


/**
 * Core bot logic goes here!
 */
var recording = {};
var note_book = {};

controller.on('bot_channel_join', function (bot, message) {
    bot.reply(message, "I'm here!")
});

controller.on('direct_message', function (bot, message) {
    if ( recording[message.user_name] ) {
        switch(note_book[message.user_name]["stage"]) {
            case 0: // opening message
                note_book[message.user_name]["stage_opener"] = message.text;
                bot.reply(message, "Got it! Moving on.\n" +
                                "What did you accomplish last week? Please enter each accomplishment as a separate message." +
                                "When you are finished, use '\\notw next' to continue.");
                break;
            case 1: // complete task from past week
                note_book[message.user_name]["stage_complete"].push(message.text);
                bot.reply(message, "Got it! Tell me another, or use '\\notw next' to move on.");
                break;
            case 2: // incomplete task from past week
                note_book[message.user_name]["stage_incompete"].push(message.text);
                bot.reply(message, "Got it! Tell me another, or use '\\notw next' to move on.");
                break;
            case 3: // Goals for coming week
                note_book[message.user_name]["stage_todo"].push(message.text);
                bot.reply(message, "Got it! Tell me another, or use '\\notw end' to move on.");
                break;
            default:
                break;

        }
    }
});

var hook_bot = controller.spawn({
    incoming_webhook: {
        url: 'https://hooks.slack.com/services/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'
    }
});

controller.on('slash_command', function(slashCommand, message) {

    if( message.command === "/notw" ) {
        if (message.text === "" || message.text === "help" ) {
            slashCommand.replyPrivate(message,
                    "Use this command to manage your notes of the week." +
                    "To begin a new note, enter '\\notw start'." +
                    "To move to a new section of your note, enter '\\notw next'." +
                    "To complete and post your note, enter '\\notw end'.");
                return;
        }

        else if ( message.text === "start" ) {
            recording[message.user_name] = true;
            note_book[message.user_name] = {
                "stage": 0,
                "stage_opener": '',
                "stage_complete": [],
                "stage_incomplete": [],
                "stage_todo": []
            };
            slashCommand.replyPrivate(message,
                "Your note is recording! Please enter any opening message you'd" +
                "like to include in your note, or enter '\\notw next' to proceed.");
            return;
        }

        else if ( message.text === "next" ) {
            if( !recording[message.user_name] ) {
                slashCommand.replyPrivate(message,
                    "You are not recording a note. To begin recording a note, enter '\\notw start'.");
                return;
            } else {
                if ( note_book[message.user_name]["stage"] == 3 ) {
                    slashCommand.replyPrivate(message,
                        "Your note is complete! Please use '\\notw end' to end this session and post your note.");
                    return;
                } else {
                    note_book[message.user_name]["stage"] += 1;
                    switch(note_book[message.user_name]["stage"]) {
                        case 1:
                            slashCommand.replyPrivate(message,
                                "What did you accomplish last week? Please enter each accomplishment as a separate message." +
                                "When you are finished, use '\\notw next' to continue.");
                            break; 
                        case 2:
                            slashCommand.replyPrivate(message,
                                "What did you NOT accomplish last week? Please enter each as a separate message." +
                                "When you are finished, use '\\notw next' to continue.");
                            break;
                        case 3:
                            slashCommand.replyPrivate(message,
                                "What do you plan accomplish next week? Please enter each goal as a separate message." +
                                "When you are finished, use '\\notw end' to finish your session and post your note.");
                            break;
                        default:
                            break;
                    }
                }
            }
        }

        else if ( message.text === "end" ) {
             if( !recording[message.user_name] ) {
                slashCommand.replyPrivate(message,
                    "You are not recording a note. To begin recording a note, enter '\\notw start'.");
                return;
            } else {
                var today = new Date();
                var date = (today.getMonth()+1)+'/'+today.getDate()+'/'+today.getFullYear();
                var opener = note_book[message.user_name]["stage_opener"] + "\n";
                var completes = note_book[message.user_name]["stage_complete"];
                var incompletes = note_book[message.user_name]["stage_incomplete"];
                var goals = note_book[message.user_name]["stage_goals"];
                var stage_one = "What "+message.user_name+" accomplished last week:\n";
                var stage_two = "What "+message.user_name+" did not accomplish last week:\n";
                var stage_three = "What "+message.user_name+" plans to accomplish this week:\n";
                for( post in completes ) {
                    stage_one = stage_one + "  - " + post + "\n";
                }
                for( post in incompletes ) {
                    stage_two = stage_two + "  - " + post + "\n";
                }
                for( post in goals ) {
                    stage_three = stage_three + "  - " + post + "\n";
                }

                var post = "Here's " + message.user_name + "'s note of the week for " + date + "!" +
                    "\n" + opener + stage_one + stage_two + stage_three;
                slashCommand.replyPrivate(message, post);
                // TODO: create a record of this note
                note_book[message.user_name] = {}; // Empty the note_book
                return;
                // hook_bot.sendWebhook({
                //     text: post,
                //     channel: '#notw',
                // },function(err,res) {
                //     if (err) {
                //         // ...
                //     }
                // });
            }
        }
    }
});



/**
 * AN example of what could be:
 * Any un-handled direct mention gets a reaction and a pat response!
 */
//controller.on('direct_message,mention,direct_mention', function (bot, message) {
//    bot.api.reactions.add({
//        timestamp: message.ts,
//        channel: message.channel,
//        name: 'robot_face',
//    }, function (err) {
//        if (err) {
//            console.log(err)
//        }
//        bot.reply(message, 'I heard you loud and clear boss.');
//    });
//});
