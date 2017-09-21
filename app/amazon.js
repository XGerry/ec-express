var helpers = require('./helpers');
var Item = require('./model/item');
var crypto = require('crypto');
var queryString = require('query-string');
var request = require('request');
var fs = require('fs');

function addProducts(callback) {
	var options = {
    url: 'https://mws.amazonservices.com/',
    qs: {
      AWSAccessKeyId: process.env.AWS_ACCESS_KEY,
      Action: 'SubmitFeed',
      ContentMD5Value: '',
      FeedType: '_POST_FLAT_FILE_LISTINGS_DATA_',
      Merchant: 'A1AG76L8PLY85T',
      PurgeAndReplace: false,
      SignatureMethod: 'HmacSHA256',
      SignatureVersion: '2',
      Timestamp: '',
      Version: '2009-01-01',
    },
    headers: {
      'Content-Type': 'text/xml'
    }
  };

  var xmlDoc = {
    AmazonEnvelope : {
      Header: {
        DocumentVersion: 1.01,
        MerchantIdentifier: 'M_ECSTASYCRA_1118417'
      },
      MessageType: 'Product',
      PurgeAndReplace: 'false'
    }
  };

  var messages = [];
  var messageCounter = 0;

  Item.find({sku: 'DUS0649'}, function(err, items) {
  	items.forEach(function(item) {
  		if (item.barcode) {
	  		var message = {
	  			MessageID: ++messageCounter,
	  			Product: {
	  				SKU: item.sku,
	  				StandardProductID: {
	  					Type: 'UPC',
	  					Value: item.barcode
	  				},
	  				DescriptionData: {
	  					Title: item.name,
	  					ItemType: '8090710011'
	  				}
	  			}
	  		}
	  		messages.push(message);
  		} else {
  			console.log(item.sku + ' had no barcode');
  		}
  	});

	  xmlDoc.AmazonEnvelope.Message = messages;

		var body = helpers.getXMLDoc(xmlDoc);
		console.log(body);
	  options.body = body;
	  var now = new Date();
	  options.qs.Timestamp = now.toISOString();
	  options.qs.ContentMD5Value = crypto.createHash('md5').update(body).digest('base64');

	  var qString = queryString.stringify(options.qs);
	  
	  var stringToSign = 'POST\n' + 
	    'mws.amazonservices.com\n' +
	    '/\n' +
	    qString;

	  options.qs.Signature = crypto.createHmac('sha256', process.env.AMAZON_SECRET_KEY)
	    .update(stringToSign)
	    .digest('base64');

	  request.post(options, function(err, response, body) {
	  	console.log(body);
	    callback(body);
	  });
	});
}

function generateSellerUploadFile(callback) {
	Item.find({}, function(err, items) {
		if (err) {
			console.log(err);
		} else {
			var tsv = getSellerHeader() + '\n';
			items.forEach(function(item) {
				tsv += 'craft-supplies\t'; 		// item_type
				tsv += item.sku + '\t'; 			// item_sku
				tsv += item.barcode + '\t'; 	// external_product_id
				tsv += 'UPC\t'; 							// external_product_id_type
				tsv += item.manufacturerName; // brand_name
			});
		}
	});
}

function generateVendorUploadFile(query, callback) {
	Item.find(query, function(err, items) {
		var tsv = getVendorHeader() + '\n';
		items.forEach(function(item) {
			tsv += item.name + '\t';
			tsv += item.manufacturerName + '\t';
			tsv += item.sku + '\t';
			tsv += item.barcode + '\t';
			tsv += 'UPC\t';
			tsv += item.usPrice + '\t';
			tsv += item.size + '\t'; // I think the best we have
			tsv += item.weight + '\t';
			tsv += item.countryOfOrigin + '\t';
			tsv += '1\t';
			tsv += '50\t';
			tsv += item.size + '\t';
			tsv += 'N/A\t';
			tsv += '\n';
		});
	});

	fs.writeFile('./feeds/amazon_vendor.tsv', tsv, function(err) {
		if (err) {
			console.log(err);
		} else {
			console.log('Feed Generated Successfully');
		}
		callback(err);
	});
}

function getVendorHeader() {
	var headers = 'item_name\t';
	headers += 'brand_name\t';
	headers += 'manufacturer\t';
	headers += 'part_number\t';
	headers += 'external_product_id\t';
	headers += 'external_product_id_type\t';
	headers += 'cost\t';
	headers += 'item_dimensions\t';
	headers += 'weight\t';
	headers += 'county_of_origin\t';
	headers += 'min_order_quantity\t';
	headers += 'case_pack_quantity\t';
	headers += 'package_dimensions\t';
	headers += 'case_upc\t';
}

function getSellerHeader() {
	var headers = 'item_type\t'; // either craft-project-kits or craft-supplies
	headers += 'item_sku\t'; // sku
	headers += 'external_product_id\t'; // EAN, GCID, GTIN, UPC value
	headers += 'external_product_id_type\t'; // EAN, GCID, GTIN, UPC
	headers += 'brand_name\t'; // Brand name or 'Generic' eg. Lenovo
	headers += 'feed_product_type\t'; // ArtSupplies
	headers += 'item_name\t'; // The name
	headers += 'manufacturer\t'; // Manufacturer name
	headers += 'part_number\t'; // sku
	headers += 'standard_price\t'; // us price
	headers += 'quantity\t'; // inventory commitment
	headers += 'migrated_shipping_group_name\t'; // Migrated Template
	headers += 'fulfillment_center_id\t'; // DEFAULT or AMAZON_NA
	headers += 'package_length\t'; // the length
	headers += 'package_width\t'; // the width
	headers += 'package_weight_unit_of_measure\t'; // GR, KG, OZ, LB
	headers += 'package_height\t'; // the height
	headers += 'package_length_unit_of_measure\t'; // CM, MM, IN
	headers += 'package_weight\t'; // the weight
	return headers;
}

module.exports = {
	addProducts: addProducts,
	generateVendorUploadFile: generateVendorUploadFile
}