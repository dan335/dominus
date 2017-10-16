// mandrill meteor package sets MAIL_URL to mandrill
// override that to use sendgrid
// Meteor.startup(function() {
//   process.env.MAIL_URL=""
// })

// Meteor.startup(function() {
//     if (Meteor.settings.mandrill.username) {
//         return Meteor.Mandrill.config({
//             username: Meteor.settings.mandrill.username,
//             key: Meteor.settings.mandrill.apikey
//         });
//     }
// });


Mandrill.config({
  username: Meteor.settings.mandrill.username,  // the email address you log into Mandrill with. Only used to set MAIL_URL.
  key: Meteor.settings.mandrill.apikey,  // get your Mandrill key from https://mandrillapp.com/settings/index
  port: 587,  // defaults to 465 for SMTP over TLS
  host: 'smtp.mandrillapp.com',  // the SMTP host
  // baseUrl: 'https://mandrillapp.com/api/1.0/'  // update this in case Mandrill changes its API endpoint URL or version
});


// pass [] to merge_vars if none
// to = [{"email": "recipient.email@example.com", "name": "Recipient Name"}]
// global_merge_vars = [{"name":"merge1", "content":"merge1 content"}]
mandrillSendTemplate = function(templateSlug, to, global_merge_vars) {
  if (!Meteor.settings.public.dominusIsDev) {
    Mandrill.messages.sendTemplate({
      "template_name": templateSlug,
      "template_content": [],
      "message": {
        "to":to,
        "merge":true,
        "merge_language":"handlebars",
        "global_merge_vars":global_merge_vars
      }
    });
  }
};
