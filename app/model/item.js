var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

var itemSchema = new mongoose.Schema({
	sku: {
		type: String,
		index: true,
		unique: true,
		dropDups: true
	},
	upc: String,
	name: String,
	description: String,
	imageURL: String,
	htc: String,
	usPrice: Number,
	canPrice: Number,
	walmartStock: {
		type: Number,
		default: 0
	},
	amazonStock: {
		type: Number,
		default: 0
	},
	stock: Number, // the total stock from quickbooks
	usStock: Number, // the stock in the us site
	canStock: Number, // the stock in the canadian site
	catalogId: Number, // this is for 3D Cart, this is the options item number
	catalogIdCan: Number,
	updated: Boolean,
	location: String,
	barcode: String,
	countryOfOrigin: String,
	htcCode: String,
	listId: String, // need this to modify the item in quickbooks
	editSequence: String, // also need this in order to modify the item in qb
	isOption: Boolean,
	inactive: Boolean,
	hidden: Boolean,
	hasOptions: Boolean,
	optionId: Number,
	optionIdCan: Number,
	onSale: Boolean,
	usSalePrice: Number,
	canSalePrice: Number,
	salePercentage: Number,
	usLink: String,
	canLink: String,
	manufacturerId: Number,
	manufacturerName: String,
	width: Number,
	height: Number,
	length: Number,
	weight: Number,
	size: String,
	categories: [String],
	lastOrderDate: Date,
	orderCount: {
		type: Number,
		default: 0
	},
	isBundle: Boolean
});

module.exports = mongoose.model('Item', itemSchema);