Template.landingSettings.helpers({
  isVerified: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {verifiedEmail:1}});
      if (user) {
        return user.verifiedEmail;
      }
    }
  },

  isMale: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {male:1}});
      if (user && user.male) {
        return 'active';
      }
    }
  },

  isFemale: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {male:1}});
      if (user) {
        if (!user.male) {
          return 'active';
        }
      }
    }
  },

  avatarUrl: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        return Meteor.settings.public.s3.url + Meteor.settings.public.s3.avatarPath + user.avatarFilename;
      }
    }
    return '';
  },

  hasAvatar: function() {
    let userId = Meteor.userId();
    if (userId) {
      let user = Meteor.users.findOne(userId, {fields: {avatarFilename:1}});
      if (user && user.avatarFilename) {
        return true;
      }
    }
  }
});


Template.landingSettings.events({
  'click #avatarRemoveButton': function(event, template) {
    event.preventDefault();

    var button = event.currentTarget;
		var button_html = $(button).html();

    $(button).attr('disabled', true);
    $(button).html('<i class="fa fa-refresh fa-spin"></i> Please Wait');

    Meteor.call('deleteAvatar', function(error, result) {
      $(button).attr('disabled', false);
      $(button).html(button_html);
    });
  },

  'click #avatarUploadButton': function(event, template) {
    event.preventDefault();

    let fileInput = template.find('#avatarInputFile');
    let file = fileInput.files[0];
    let size = file.size;
    let type = file.type;

    var button = event.currentTarget;
		var button_html = $(button).html();

    let errorAlert = template.find('#settingsErrorAlert');
    let successAlert = template.find('#settingsSuccessAlert');

    $(errorAlert).hide();
    $(successAlert).hide();

		$(button).attr('disabled', true);
		$(button).html('<i class="fa fa-refresh fa-spin"></i> Uploading Image');

    let reader = new FileReader();
    reader.onload = function(e) {
      e.target.result = e.target.result.match(/,(.*)$/)[1]; // remove first part before ","
      Meteor.call('uploadAvatarToS3', e.target.result, type, size, function(error, result) {
        if (error) {
          $(errorAlert).show();
          $(errorAlert).html(error.error);
        } else {
          $(successAlert).show();
          $(successAlert).html('Image saved.');
        }

        $(button).attr('disabled', false);
				$(button).html(button_html);
      });
    }
    reader.readAsDataURL(file);
  },

  'click #resendVerificationButton': function(event, template) {
    event.preventDefault();

    let errorAlert = template.find('#settingsErrorAlert');
    let successAlert = template.find('#settingsSuccessAlert');

    $(errorAlert).hide();
    $(successAlert).hide();

    $(button).attr('disabled', true);
		$(button).html('Please Wait');

    let userId = Meteor.userId();
    if (userId) {
      Meteor.call('rensendEmailVerification', function(error, result) {
        if (error) {
          $(errorAlert).show()
					$(errorAlert).html(error.reason)
        } else {
          $(successAlert).show();
          $(successAlert).html('Email sent.');
        }

        $(button).attr('disabled', false);
				$(button).html(button_html);
      });
    }
  },

  'click #deleteAccountButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/deleteAccount');
  },

  'click .gotoProfileButton': function(event, template) {
    event.preventDefault();
    SimpleRouter.go('/profile/'+Meteor.userId());
  },

  'click #changeUsernameButton': function(event, template) {
    event.preventDefault();
    let nameInput = template.find('#changeUsernameInput');
    let button = template.find('#changeUsernameButton');
    let alert = template.find('#settingsErrorAlert');
    let successAlert = template.find('#settingsSuccessAlert');

    var button_html = $(button).html()
    $(button).attr('disabled', true);
    $(button).html('Please Wait');

    $(alert).hide();
    $(successAlert).hide();

    nameInput.value = nameInput.value.replace(/[^a-zA-Z0-9_\s]+/g, "");

    Meteor.apply('changeMainUsername', [nameInput.value], {throwStubExceptions:false}, function(error, result) {
      if (error) {
        $(alert).show();
        $(alert).html(error.error);
      } else {
        $(successAlert).show();
        $(successAlert).html('Username changed.');
      }

      $(button).attr('disabled', false);
      $(button).html(button_html);
    });
  },

  'click #genderMaleButton': function(event, template) {
    event.preventDefault();
    Meteor.call('setGender', true);
  },

  'click #genderFemaleButton': function(event, template) {
    event.preventDefault();
    Meteor.call('setGender', false);
  },
});
