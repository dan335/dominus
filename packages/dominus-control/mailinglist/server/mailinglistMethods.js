const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


Meteor.methods({
  sendToMailingList: async function(templateName) {
    check(templateName, String);
    if (!this.userId) {
      throw new Meteor.Error('Not admin.');
    }

    var user = await Meteor.users.findOneAsync(this.userId, {fields:{admin:1}});
    if (!user || !user.admin) {
      throw new Meteor.Error('control.games.addGame', 'Must be admin.');
    }

    await Queues.addAsyncOrLog('sendToMailingList', {templateName:templateName}, {delay:0, timeout:1000*60*5}, false);
  },


  // mailTemplateToOldProUsers: function(templateName) {
  //   if (!this.userId) {
  //     throw new Meteor.Error('Not admin.');
  //   }
  //
  //   var user = Meteor.users.findOne(this.userId, {fields:{admin:1}});
  //   if (!user || !user.admin) {
  //     throw new Meteor.Error('control.mailTemplateToOldProUsers', 'Must be admin.');
  //   }
  //
  //   Queues.add('mailTemplateToOldProUsers', {templateName:templateName}, {delay:0, timeout:1000*60*5}, false);
  // }
});





// if (process.env.DOMINUS_WORKER == 'true') {
//   Queues.mailTemplateToOldProUsers.process(Meteor.bindEnvironment(function(job) {
//
//     check(job.data.templateName, String);
//
//     let to = OldProUsers.find().map(function(person) {
//       return {"email": person.email, "username": person.username};
//     });
//
//     if (to.length) {
//       let global_merge_vars = [
//         {"name":"domain", "content":Meteor.absoluteUrl()}
//       ];
//
//       if (Meteor.settings.public.dominusIsDev) {
//         console.log('sendToMailingList', job.data.templateName, to.length, global_merge_vars);
//       } else {
//         mandrillSendTemplate(job.data.templateName, to, global_merge_vars);
//       }
//
//       console.log('Sent '+job.data.templateName+' to '+to.length+' people.');
//     } else {
//       console.error('Send failed, to is empty.');
//     }
//
//     return Promise.resolve();
//   }));
// }






if (process.env.DOMINUS_WORKER == 'true') {
  Queues.sendToMailingList.process(async function(job) {

    check(job.data.templateName, String);

    let list = (await MailingList.find().fetchAsync()).map(function(person) {
      //return {"email": person.email, "name": person.name};
      return person.email;
    })

    // remove bad values
    list = _.filter(list, function(item) {
      //return (_.isString(item.email) && _.isString(item.name));
      return _.isString(item);
    })

    let howMany = list.length;

    var chunks = [];
    var i,j,temparray,chunk = 500;
    for (i=0,j=list.length; i<j; i+=chunk) {
        temparray = list.slice(i,i+chunk);
        chunks.push(temparray);
    }

    // var global_merge_vars = [
    //   {"name":"domain", "content":Meteor.absoluteUrl()}
    // ];

    chunks.forEach(function(to) {
      const msg = {
        to: to,
        from: 'dan@dominusgame.net',
        templateId: job.data.templateName
      };

      if (Meteor.settings.public.dominusIsDev) {
        //console.log('sendToMailingList', job.data.templateName, to.length);
        console.log(msg);
        sgMail.sendMultiple(msg);
      } else {
        sgMail.sendMultiple(msg);
      }
    });

    console.log('Sent '+job.data.templateName+' to '+howMany+' people.');
  });
}







if (process.env.DOMINUS_WORKER == 'true') {
  Queues.addToMailingList.process(async function(job) {

    check(job.data.name, String);
    check(job.data.email, String);

    await MailingList.upsertAsync({email:job.data.email}, {$setOnInsert: {
      email: job.data.email,
      name: job.data.name,
      skip: false,
      added: new Date()
    }});
  });
}
