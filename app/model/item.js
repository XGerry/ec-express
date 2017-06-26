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
	stock: Number
});

module.exports = mongoose.model('Item', itemSchema);