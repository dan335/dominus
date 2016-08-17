Meteor.methods({
  rensendEmailVerification: function() {
    this.unblock();
    if (!this.isSimulation) {
      Accounts.sendVerificationEmail(this.userId);
    }
  },


  deleteAvatar: function() {
    this.unblock();
    var self = this;
    if (!this.isSimulation) {
      let user = Meteor.users.findOne(this.userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        let file = Meteor.settings.public.s3.avatarPath + user.avatarFilename;
        deleteS3File(file);
        Meteor.users.update(self.userId, {$set: {avatarFilename:null}});
      }
    }
  },


  uploadAvatarToS3: function(file, type, size) {
    this.unblock();
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

    let user = Meteor.users.findOne(this.userId, {fields: {username:1, avatarFilename:1}});
    if (!user) {
      throw new Meteor.Error('User not found.');
    }

    if (!this.isSimulation) {

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

      var gmFuture = new Future();

      gm(buffer).resizeExact(150, 150).toBuffer(Meteor.bindEnvironment(function(error, buffer) {

        if (error) {

          console.error(error)
          gmFuture['return'](false);

        } else {

          var future = new Future();

          var req = dLanding.knox.put(destination, {
            'Content-Length': buffer.length,
            'Content-Type': 'image/jpg',
            'Expires': expireDate,
            'Cache-Control': 'max-age=31557600'
          });
          req.on('response', Meteor.bindEnvironment(function(res){
            if (200 == res.statusCode) {
              Meteor.users.update(user._id, {$set: {avatarFilename:filename}})
              future['return'](true);
            } else {
              future['return'](false);
            }
          }));
          req.end(buffer);

          gmFuture['return'](future.wait());

        }
      }));

      return gmFuture.wait();
    }
  },


  deleteEntireAccount: function() {

    if (!this.isSimulation) {
      // delete from all games
      let players = Players.find({userId:this.userId}, {fields: {username:1, gameId:1}});
      if (players.count()) {
        players.forEach(function(player) {
          Queues.add('deleteGameAccount', {playerId:player._id, gameId:player.gameId, username:player.username}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
        });
      }

      // delete user account
      //UserImages.remove({associatedObjectId:this.userId});
      Meteor.users.remove(this.userId);
      Gamesignups.remove({userId:this.userId});
    }
  },


  deleteGameAccount: function(gameId) {
    check(gameId, String);

    if (!this.isSimulation) {
      let player = Players.findOne({userId:this.userId, gameId:gameId}, {fields: {username:1}});
      if (!player) {
        throw new Meteor.Error('Player not found.');
      }

      Queues.add('deleteGameAccount', {playerId:player._id, gameId:gameId, username:player.username}, {attempts:10, backoff:{type:'fixed', delay:15000}, delay:0, timeout:1000*60*5}, player._id);
    }
  },


  // called from onEmailVerificationLink callback
  // when someone verifies their email
  onEmailVerified: function() {
    Meteor.users.update(this.userId, {$set:{verifiedEmail:true}});
  },


  changeMainUsername: function(username) {
    let options = {fields: {username:1}};
    let user = Meteor.users.findOne(this.userId, options);

    if (!user) {
      throw new Meteor.Error('User not found.');
    }

    username = username.replace(/[^0-9a-zA-Z_\s]/g, '');
    usernameNoSpaces = username.replace(/[^0-9a-zA-Z_]/g, '');

    if (username == user.username) {
      throw new Meteor.Error('You are already named '+username);
    }

    if (usernameNoSpaces.length < 3) {
      throw new Meteor.Error('New username must be at least 3 characters long.');
    }

    if (username.length > 25) {
      throw new Meteor.Error('New username is too long.');
    }

    if (!this.isSimulation) {
      if (Accounts.findUserByUsername(username)) {
        throw new Meteor.Error('A user exists with this username, try another.');
      }
    }

    Meteor.users.update(this.userId, {$set: {username:username}});

    Forumtopics.update({lastPostUserId:this.userId}, {$set: {lastPostUsername:username}}, {multi:true});
  },

  setGender: function(isMale) {
    this.unblock();
    check(isMale, Boolean);
    Meteor.users.update(this.userId, {$set: {male:isMale}});
    Players.update({userId:this.userId}, {$set: {male:isMale}}, {multi:true});
    Castles.update({user_id:this.userId}, {$set: {male:isMale}}, {multi:true});
    Villages.update({user_id:this.userId}, {$set: {male:isMale}}, {multi:true});
    Armies.update({user_id:this.userId}, {$set: {male:isMale}}, {multi:true});
  }
})



var deleteS3File = function(file) {
  dLanding.knox.deleteFile(file, Meteor.bindEnvironment(function(error, res){
    if (error) {
      throw new Meteor.Error(error);
    }
  }));
}
