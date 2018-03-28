var helpers = require('./helpers');
var Item = require('./model/item');
var crypto = require('crypto');
var queryString = require('query-string');
var request = require('request');
var fs = require('fs');

function addProducts(sku) {
	var itemPromise = Item.find({sku: sku});
	addProductToAmazon(itemPromise);
}

function bulkAddItems(skus) {
	var itemPromise = Item.find({sku: {$in: skus}});
	addProductToAmazon(itemPromise);
}

function addProductToAmazon(itemPromise) {
	function productMessage(item) {
		var barcodeType = 'UPC';
		if (item.barcode.length == 13) {
			barcodeType = 'EAN';
		}

		var cleanDescription = item.description.replace(/<\/?[^>]+(>|$)/g, "");

		var message = {
			SKU: item.sku,
			StandardProductID: {
				Type: barcodeType,
				Value: item.barcode
			},
			Condition: {
				ConditionType: 'New'
			},
			DescriptionData: {
				Title: item.name,
				Brand: item.manufacturerName,
				Description: cleanDescription,
				Manufacturer: item.manufacturerName,
				ItemType: 'paper-craft-supplies'
			},
			ProductData: {
				Arts: {
					ProductType: 'ArtSupplies',
					ProductCategory: 'Hobbies',
					ProductSubcategory: 'Decorative_Arts',
				}
			}
		};
		return message;
	}

	doAmazonRequest(itemPromise,
		'_POST_PRODUCT_DATA_',
		'Product',
		'POST',
		productMessage,
		genericCallback);
}

function buildInventoryMessage(item) {
	var inventoryMessage = {
		SKU: item.sku,
		Quantity: item.amazonStock,
		FulfillmentLatency: 3
	};
	return inventoryMessage;
}

function updateInventoryItem(sku) {
	var itemPromise = Item.find({sku: sku});

	doAmazonRequest(itemPromise, 
		'_POST_INVENTORY_AVAILABILITY_DATA_',
		'Inventory',
		'POST',
		buildInventoryMessage,
		genericCallback);
}

function updateAllInventory() {
	var itemPromise = Item.find({});
	doAmazonRequest(itemPromise, 
		'_POST_INVENTORY_AVAILABILITY_DATA_',
		'Inventory',
		'POST',
		buildInventoryMessage,
		genericCallback);
}

function updateInventory() {
	var itemPromise = Item.find({updated: true});
	doAmazonRequest(itemPromise, 
		'_POST_INVENTORY_AVAILABILITY_DATA_',
		'Inventory',
		'POST',
		buildInventoryMessage,
		genericCallback);
}

function inventorySync(itemPromise) {
	doAmazonRequest(itemPromise,'_POST_INVENTORY_AVAILABILITY_DATA_',
		'Inventory',
		'POST',
		buildInventoryMessage,
		genericCallback);
}

function imageMessage(item, imageType) {
	var imageURL = item.imageURL;
	if (imageURL[0] != '/') {
		imageURL = '/'+imageURL;
	}
	var message = [{
		SKU: item.sku,
		ImageType: 'MainOfferImage',
		ImageLocation: 'https://www.ecstasycrafts.com' + imageURL
	}];
	return message;
};

function addProductImage(sku) {
	var itemPromise = Item.find({sku: sku});

	doAmazonRequest(itemPromise,
		'_POST_PRODUCT_IMAGE_DATA_',
		'ProductImage',
		'POST',
		imageMessage,
		genericCallback);
}

function bulkAddImages(skus) {
	var itemPromise = Item.find({sku: {$in: skus}});

	doAmazonRequest(itemPromise,
		'_POST_PRODUCT_IMAGE_DATA_',
		'ProductImage',
		'POST',
		imageMessage,
		genericCallback);
}

function buildPriceMessage(item) {
	var priceMessage = {
		SKU: item.sku,
			StandardPrice: {
			'@currency': 'USD',
			'#text': item.usPrice
		}
	};
	return priceMessage;
}

function updatePricing(sku) {
	var itemPromise = Item.find({sku: sku});

	doAmazonRequest(itemPromise, 
		'_POST_PRODUCT_PRICING_DATA_', 
		'Price', 
		'POST', 
		buildPriceMessage, 
		genericCallback);
}

function bulkAddPrices(skus) {
	var itemPromise = Item.find({sku: {$in: skus}});

	doAmazonRequest(itemPromise, 
		'_POST_PRODUCT_PRICING_DATA_', 
		'Price', 
		'POST', 
		buildPriceMessage, 
		genericCallback);
}

function doAmazonRequest(itemPromise, feedType, itemType, httpMethod, documentBuilder, callback) {
	var xmlDoc = getFeed(itemType);
	var messages = [];
  var messageCounter = 0;

	itemPromise.then(function(items) {
		console.log('found items' + items.length);
		items.forEach(function(item) {
			var message = {
				MessageID: ++messageCounter,
  			OperationType: 'Update'
			};
			message[itemType] = documentBuilder(item);
			messages.push(message);
		});
		
		xmlDoc.AmazonEnvelope.Message = messages;
		var body = helpers.getXMLDoc(xmlDoc);
		console.log(body);
		var options = getOptions(feedType, httpMethod, body);
		request(options, callback);
	});
}

function getFeed(messageType) {
	var xmlDoc = {
    AmazonEnvelope : {
      Header: {
        DocumentVersion: 1.01,
        MerchantIdentifier: 'M_ECSTASYCRA_1118417'
      },
      MessageType: messageType,
      PurgeAndReplace: 'false'
    }
  };
  return xmlDoc;
}

function getOptions(feedType, method, body) {
  var now = new Date();
	var options = {
    url: 'https://mws.amazonservices.com/',
    method: method,
    qs: {
      AWSAccessKeyId: process.env.AWS_ACCESS_KEY,
      Action: 'SubmitFeed',
      ContentMD5Value: crypto.createHash('md5').update(body).digest('base64'),
      FeedType: feedType,
      Merchant: process.env.SELLER_ID,
      PurgeAndReplace: false,
      SignatureMethod: 'HmacSHA256',
      SignatureVersion: '2',
      Timestamp: now.toISOString(),
      Version: '2009-01-01'
    },
    headers: {
      'Content-Type': 'text/xml'
    }
  };

  options.body = body;

  var qString = queryString.stringify(options.qs);
  var stringToSign = method+'\n' + 
    'mws.amazonservices.com\n' +
    '/\n' +
    qString;

  options.qs.Signature = crypto.createHmac('sha256', process.env.AMAZON_SECRET_KEY)
    .update(stringToSign)
    .digest('base64');

  return options;
}

function genericCallback(err, response, body) {
	console.log(body);
}

function generateSellerUploadFile(query, options, callback) {
	Item.find(query, function(err, items) {
		if (err) {
			console.log(err);
		} else {
			var tsv = getSellerHeader() + '\n';
			items.forEach(function(item) {
				tsv += 'craft-supplies\t'; 						// item_type
				tsv += item.sku + '\t'; 							// item_sku
				tsv += item.barcode + '\t'; 					// external_product_id
				tsv += 'UPC\t'; 											// external_product_id_type
				tsv += item.manufacturerName + '\t'; 	// brand_name
				tsv += 'ArtSupplies\t';				 				// feed_product_type
				tsv += item.name + '\t';			 				// item_name
				tsv += item.manufacturerName + '\t';	// manufacturer
				tsv += item.sku + '\t';								// part_number
				tsv += item.usPrice + '\t';						// standard_price
				tsv += Math.floor(item.stock * 0.05) + '\t';							// quantity (this is based on a percentage of our stock levels)
				tsv += 'Migrated Template\t';					// quantity (this is based on a percentage of our stock levels)
				tsv += 'https://www.ecstasycrafts.com/' + item.imageURL + '\t';					// main_image_url
				tsv += item.description + '\t';				// product_description
				tsv += 'DEFAULT\t';										// fulfillment_center_id
				tsv += item.length + '\t';						// package_length
				tsv += item.width + '\t';							// package_width
				tsv += item.height + '\t';						// package_height
				tsv += item.weight + '\t';						// package_weight
				tsv += 'OZ\t';												// package_weight_unit_of_measure
				tsv += 'IN\t';												// package_length_unit_of_measure
				tsv += '\n';
			});

			fs.writeFile('./feeds/amazon_seller.tsv', tsv, function(err) {
				if (err) {
					console.log(err);
				} else {
					console.log('Seller Feed Generated Successfully');
				}
			})
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
	var headers = 'item_type\t'; 										// either craft-project-kits or craft-supplies
	headers += 'item_sku\t'; 												// sku
	headers += 'external_product_id\t'; 						// EAN, GCID, GTIN, UPC value
	headers += 'external_product_id_type\t'; 				// EAN, GCID, GTIN, UPC
	headers += 'brand_name\t'; 											// Brand name or 'Generic' eg. Lenovo
	headers += 'feed_product_type\t'; 							// ArtSupplies
	headers += 'item_name\t'; 											// The name
	headers += 'manufacturer\t'; 										// Manufacturer name
	headers += 'part_number\t'; 										// sku
	headers += 'standard_price\t'; 									// us price
	headers += 'quantity\t'; 												// inventory commitment
	headers += 'migrated_shipping_group_name\t'; 		// Migrated Template
	headers += 'main_image_url\t'; 									// image
	headers += 'product_description\t'; 						// description
	headers += 'fulfillment_center_id\t'; 					// DEFAULT or AMAZON_NA
	headers += 'package_length\t'; 									// the length
	headers += 'package_width\t'; 									// the width
	headers += 'package_height\t'; 									// the height
	headers += 'package_weight\t'; 									// the weight
	headers += 'package_weight_unit_of_measure\t'; 	// GR, KG, OZ, LB
	headers += 'package_length_unit_of_measure\t'; 	// CM, MM, IN
	return headers;
}

module.exports = {
	addProducts: addProducts,
	generateVendorUploadFile: generateVendorUploadFile,
	generateSellerUploadFile: generateSellerUploadFile,
	addProductImage: addProductImage,
	updateInventory: updateInventory,
	updateAllInventory: updateAllInventory,
	updateInventoryItem: updateInventoryItem,
	updatePricing: updatePricing,
	bulkAddImages: bulkAddImages,
	bulkAddItems: bulkAddItems,
	bulkAddPrices: bulkAddPrices,
	inventorySync: inventorySync
}