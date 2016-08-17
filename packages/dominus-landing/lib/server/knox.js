dLanding.knox = Knox.createClient({
  key: process.env.S3ACCESSKEYID,
  secret: process.env.S3SECRETACCESSKEY,
  bucket: Meteor.settings.public.s3.bucket,
  region: Meteor.settings.public.s3.region
});
