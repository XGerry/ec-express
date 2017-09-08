var mongoose = require('mongoose');

var itemSchema = new mongoose.Schema({
	sku : {
		type : String,
		index : true
	},
	upc : String,
	name : String,
	description : String,
	imageURL : String,
	htc : String,
	usPrice: Number,
	canPrice: Number,
	stock: Number, // the total stock from quickbooks
	usStock: Number, // the stock in the us site
	canStock: Number, // the stock in the canadian site
	catalogId: Number, // this is for 3D Cart, this is the options item number
	catalogIdCan: Number,
	updated: Boolean,
	location: String,
	barcode: String,
	countryOfOrigin: String,
	listId: String, // need this to modify the item in quickbooks
	editSequence: String, // also need this in order to modify the item in qb
	isOption: Boolean,
	inactive: Boolean,
	hasOptions: Boolean,
	optionId: Number,
	optionIdCan: Number,
	onSale: Boolean,
	salePrice: Number
});

module.exports = mongoose.model('Item', itemSchema);