if (Meteor.isClient) {
	RankingsAllies = new Mongo.Collection('ally_rankings')
	RankingsIncome = new Mongo.Collection('income_rankings')
	RankingsLostSoldiers = new Mongo.Collection('losses_rankings')
	RankingsVillages = new Mongo.Collection('village_rankings')
	RankingsCountries = new Mongo.Collection('country_rankings')
}
