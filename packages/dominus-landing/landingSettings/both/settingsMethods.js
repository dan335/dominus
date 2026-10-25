// onEmailVerified, changeMainUsername and setGender run on the client too, so
// the change shows at once. Each stays a plain function: the simulation is
// sync and the server's part is async (see "Async conversion" in CLAUDE.md).
// The others did nothing in the browser, so they are server-only.

var checkNewUsername = function(user, username, usernameNoSpaces) {
  if (!user) {
    throw new Meteor.Error('User not found.');
  }

  if (username == user.username) {
    throw new Meteor.Error('You are already named '+username);
  }

  if (usernameNoSpaces.length < 3) {
    throw new Meteor.Error('New username must be at least 3 characters long.');
  }

  if (username.length > 25) {
    throw new Meteor.Error('New username is too long.');
  }
};

Meteor.methods({
  // called from onEmailVerificationLink callback
  // when someone verifies their email
  onEmailVerified: function() {
    if (this.isSimulation) {
      Meteor.users.update(this.userId, {$set:{verifiedEmail:true}});
      return;
    }
    return (async () => {
      await Meteor.users.updateAsync(this.userId, {$set:{verifiedEmail:true}});
    })();
  },


  changeMainUsername: function(username) {
    check(username, String);
    var userId = this.userId;
    let options = {fields: {username:1}};

    username = username.replace(/[^0-9a-zA-Z_\s]/g, '');
    usernameNoSpaces = username.replace(/[^0-9a-zA-Z_]/g, '');

    if (this.isSimulation) {
      checkNewUsername(Meteor.users.findOne(userId, options), username, usernameNoSpaces);
      Meteor.users.update(userId, {$set: {username:username}});
      Forumtopics.update({lastPostUserId:userId}, {$set: {lastPostUsername:username}}, {multi:true});
      return;
    }

    return (async () => {
      checkNewUsername(await Meteor.users.findOneAsync(userId, options), username, usernameNoSpaces);

      // sync on 2.16, a promise on Meteor 3
      if (await Accounts.findUserByUsername(username)) {
        throw new Meteor.Error('A user exists with this username, try another.');
      }

      await Meteor.users.updateAsync(userId, {$set: {username:username}});

      await Forumtopics.updateAsync({lastPostUserId:userId}, {$set: {lastPostUsername:username}}, {multi:true});
    })();
  },

  setGender: function(isMale) {
    //this.unblock();
    check(isMale, Boolean);
    var userId = this.userId;
    if (this.isSimulation) {
      Meteor.users.update(userId, {$set: {male:isMale}});
      Players.update({userId:userId}, {$set: {male:isMale}}, {multi:true});
      Castles.update({user_id:userId}, {$set: {male:isMale}}, {multi:true});
      Villages.update({user_id:userId}, {$set: {male:isMale}}, {multi:true});
      Armies.update({user_id:userId}, {$set: {male:isMale}}, {multi:true});
      return;
    }
    return (async () => {
      await Meteor.users.updateAsync(userId, {$set: {male:isMale}});
      await Players.updateAsync({userId:userId}, {$set: {male:isMale}}, {multi:true});
      await Castles.updateAsync({user_id:userId}, {$set: {male:isMale}}, {multi:true});
      await Villages.updateAsync({user_id:userId}, {$set: {male:isMale}}, {multi:true});
      await Armies.updateAsync({user_id:userId}, {$set: {male:isMale}}, {multi:true});
    })();
  }
})


if (Meteor.isServer) {
  Meteor.methods({
    rensendEmailVerification: async function() {
      //this.unblock();
      // sync on 2.16, a promise on Meteor 3
      await Accounts.sendVerificationEmail(this.userId);
    },


    deleteAvatar: async function() {
      //this.unblock();
      var self = this;
      let user = await Meteor.users.findOneAsync(this.userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        let file = Meteor.settings.public.s3.avatarPath + user.avatarFilename;
        deleteS3File(file);
        await Meteor.users.updateAsync(self.userId, {$set: {avatarFilename:null}});
      }
    },


    uploadAvatarToS3: async function(file, type, size) {
      check(file, String);
      check(size, Number);
      //this.unblock();
      check(type, String);

      var extension = null;

      switch(type) {
        case 'image/jpeg':
          extension = 'jpg';
          break;
        case 'image/png':
          extension = 'png';
          break;
      }

      if (!extension) {
        throw new Meteor.Error('Image type must be jpg or png.');
      }

      if (size > 5242880) {
        throw new Meteor.Error('Image must be less than 5mb.');
      }

      let user = await Meteor.users.findOneAsync(this.userId, {fields: {username:1, avatarFilename:1}});
      if (!user) {
        throw new Meteor.Error('User not found.');
      }

      if (user.avatarFilename) {
        deleteS3File(Meteor.settings.public.s3.avatarPath + user.avatarFilename);
      }

      var gm = Npm.require('gm').subClass({imageMagick: true});

      let filename = user.username + '_' + Random.id();
      filename = filename.replace(/\W/g, ''); // remove non alphanumeric
      filename += '.' + extension;
      let destination = Meteor.settings.public.s3.avatarPath + filename;
      let expireDate = moment().add(1, 'years').toDate().toUTCString();

      var buffer = new Buffer(file.replace(/^data:image\/(png|gif|jpeg);base64,/,''), 'base64');

      // write to file - used to test only
      // fs.writeFile(filename, buff, function (err) {
      //     console.log('done');
      // });

      let resized = await new Promise(function(resolve) {
        gm(buffer).resizeExact(150, 150).toBuffer(function(error, buffer) {
          if (error) {
            console.error(error)
            resolve(null);
          } else {
            resolve(buffer);
          }
        });
      });
      if (!resized) {
        return false;
      }

      let uploaded = await new Promise(function(resolve) {
        var req = dLanding.knox.put(destination, {
          'Content-Length': resized.length,
          'Content-Type': 'image/jpg',
          'Expires': expireDate,
          'Cache-Control': 'max-age=31557600'
        });
        req.on('response', function(res){
          resolve(200 == res.statusCode);
        });
        req.end(resized);
      });
      if (!uploaded) {
        return false;
      }

      await Meteor.users.updateAsync(user._id, {$set: {avatarFilename:filename}})
      return true;
    },


    deleteEntireAccount: async function() {
      // delete from all games
      let players = await Players.find({userId:this.userId}, {fields: {username:1, gameId:1}}).fetchAsync();
      for (const player of players) {
        await Queues.addAsyncOrLog('deleteGameAccount', {playerId:player._id, gameId:player.gameId, username:player.username}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
      }

      // delete user account
      //UserImages.remove({associatedObjectId:this.userId});
      await Meteor.users.removeAsync(this.userId);
      await Gamesignups.removeAsync({userId:this.userId});
    },


    deleteGameAccount: async function(gameId) {
      check(gameId, String);

      let player = await Players.findOneAsync({userId:this.userId, gameId:gameId}, {fields: {username:1}});
      if (!player) {
        throw new Meteor.Error('Player not found.');
      }

      await Queues.addAsyncOrLog('deleteGameAccount', {playerId:player._id, gameId:gameId, username:player.username}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
    }
  });
}



var deleteS3File = function(file) {
  dLanding.knox.deleteFile(file, Meteor.bindEnvironment(function(error, res){
    if (error) {
      throw new Meteor.Error(error);
    }
  }));
}
