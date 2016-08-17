if (Meteor.isClient) {
    // client only collections to hold data for alerts
    AlertUsers = new Mongo.Collection('alertplayers')
    AlertChatrooms = new Mongo.Collection('alertchatrooms')
    AlertArmies = new Mongo.Collection('alertarmies')
    AlertCastles = new Mongo.Collection('alertcastles');
    AlertCapitals = new Mongo.Collection('alertcapitals');
    AlertVillages = new Mongo.Collection('alertvillages')

    AlertBattleTitles = new Mongo.Collection('alertbattletitles')
    UnreadAlerts = new Mongo.Collection('unreadalerts')
}
