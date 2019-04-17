var socket = io();

var itemsInOrder = [];
var theItem = {};
var theOrder = {};
var theCustomer = {};
var theEditItem = {};
var loadingOrder = false;
var originalCSV = null;

$(document).ready(function() {
	$('#itemSKU').on('input propertychange', function() {
		//socket.emit('searchSKU', $('#itemSKU').val());
	});

	$('#itemSKU').on('keydown', function(e) {
		var code = e.keyCode || e.which;
		if (code === 9) {
			var sku = $('#itemSKU').val().trim();
			socket.emit('searchDB', {sku: sku});
		} else if (e.ctrlKey && code === 40) { // down arrow
			socket.emit('searchSKU', $('#itemSKU').val());
		}
	});

	$('#profileSelect').change(function(e) {
		customerProfile = $('#profileSelect').val();
	});

	$('#itemQuantity').change(function(e) {
		calculateLineTotal();
	});

	$('#itemPrice').change(function(e) {
		calculateLineTotal();
	});

	$('#addItemButton').click(function(e) {
		addItemToOrder();
	});

	$('#lineTotal').on('keydown', e => {
		if (e.keyCode == 9) { // tab
			e.preventDefault();
			addItemToOrder();
		}
	});

	$('#saveToSiteButton').click(function(e) {
		e.preventDefault();
		$('#saveOrderButton').button('loading');
		$('#orderInfo').text('Saving order. Please wait...');
		socket.emit('saveCustomOrder', generateOrder(), true, response => {
			console.log(response);
			if (response.error) {
				$('#orderInfo').text(response.error);
			} else {
				onSaveOrderFinished(response.order);
			}
		});
	});

	$('#saveOrderButton').click(e => {
		$('#saveButton').button('loading');
		socket.emit('saveCustomOrder', generateOrder(), false, response => {
			if (response.error) {
				$('#orderInfo').text('There was an error when saving the order');
			} else {
				onSaveOrderFinished(response.order);
			}
		});
	});

	$('#createOrderButton').click(e => {
		e.preventDefault();
		socket.emit('createCustomOrder', generateOrder(), response => {
			// redirect to the order
			window.location = '/order?id='+response._id;
		});
	});

	$('#sameAsShippingButton').click(function(e) {
		copyBillingToShipping();
	});

	$('#saveCustomerButton').click(function(e) {
		saveCustomer();
	});

	$('#saveItemButton').click(function(e) {
		saveItem();
		calculateTotals();
	});

	$('#taxOptions').change(function(e) {
		calculateTotals();
	});

	$('#shipping').change(e => {
		calculateTotals();
	});

	$('#discount').change(e => {
		calculateTotals();
	});

	$('#discountType').change(e => {
		var type = $('#discountType').val();
		if (type == 'percentage') {
			$('#typeSymbol').text('%');
		} else {
			$('#typeSymbol').text('$');
		}
	});

	$('#customerEmail').on('keydown', e => {
		if (e.keyCode == 13) {
			searchCustomer();
		}
	});

	$('#customerSearch').click(e => {
		searchCustomer();
	});

	$('#shippingOptions').change(e => {
		calculateTotals();
	});

	$('#clearItemsButton').click(e => {
		e.preventDefault();
		itemsInOrder = [];
		buildOrderTable();
		calculateTotals();
	});

	$('#browseButton').click(e => {
		e.preventDefault();
		$('#fileInput').val('');
		$('#fileInput').click();
	});

	$('#removeFromOrderButton').click(e => {
		var i = itemsInOrder.indexOf(theEditItem);
		itemsInOrder.splice(i, 1);
		buildOrderTable();
		calculateTotals();
		$('#itemModal').modal('hide');
	});

	$('#deleteOrder').click(e => {
		e.preventDefault();
		var confirmation = confirm('Are you sure you want to remove this order? This will not cancel the order in 3D Cart.');
		if (confirmation)
			socket.emit('deleteCustomOrder', theOrder);
	})

	$('#fileInput').on('change', e => {
		console.log('file change');
		$('#fileName').text(e.target.files[0].name);

		$('#fileInput').parse({
			config: {
				complete: function(results, file) {
					loadFromFile(results.data);
				},
				header: true
			},
			complete: function() {
				console.log('all files done');
			}
		});
	});
});

socket.on('searchSKUFinished', function(items) {
	$('#itemList').empty();
	items.forEach(function(item) {
		$('#itemList').append('<option>'+item.sku+'</option>');
	});
	$('#addItemButton').prop('disabled', '');
});

socket.on('searchFinished', function(items) {
	// just want the first item
	if (items.length == 0) {
		console.log('not found');
		socket.emit('searchSKU', $('#itemSKU').val());
		$('#itemSKU').focus();
	} else {
		var item = items[0];
		fillItemLine(item);
		calculateLineTotal();
		theItem = item;
	}
});

socket.on('deleteCustomOrderFinished', () => {
	window.location = '/list-orders';
});

socket.on('findingItemsFinished', items => {
	items.forEach(item => {
		item.salesPrice = determineItemPrice(item);
		itemsInOrder.push(item);
		addItemRow(item);
	});
	calculateTotals();
});

function searchCustomer() {
	console.log('searching customer');
	loadingOrder = false;
	var customerEmail = $('#customerEmail').val();
	$('#customerSearch').button('loading');
	axios.get('/api/customers/'+customerEmail).then(response => {
		console.log(response);
		if (response.data) {
			theCustomer.name = response.data.name;
			setCustomerModalFields(response.data);
			$('#customerModal').modal();
		} else {
			alert('No customer found on 3D Cart!');
		}
	});
}

function onSaveOrderFinished(order) {
	theOrder = order;
	$('#saveOrderButton').button('reset');
	var invoiceNumber = order.invoiceNumber;
	var message = 'Saved successfully.';
	if (invoiceNumber != undefined) {
		message += ' ' + invoiceNumber;
		$('#orderNavTitle').text(invoiceNumber);
	}
	$('#orderInfo').text(message);
	setTimeout(() => {
		$('#orderInfo').text('');
	}, 3000);
}

function loadFromFile(items) {
	originalCSV = items;
	socket.emit('findItemsForOrder', items);
}

function loadOrder(customOrder) {
	if (customOrder) {
		console.log(customOrder);
		theOrder = customOrder;

		if (customOrder.invoiceNumber) {
			$('#orderNavTitle').text(customOrder.invoiceNumber);
		}

		// populate customer
		theCustomer = customOrder.customer;
		addCustomerRow(customOrder.customer);

		// populate items
		itemsInOrder = customOrder.items;
		buildOrderTable();

		// populate options
		setOptions(customOrder);
		calculateTotals();
	}
}

function setOptions(customOrder) {
	if (customOrder.discountType)
		$('#discountType').val(customOrder.discountType);
	if (!isNaN(customOrder.discountValue))
		$('#discount').val(parseFloat(customOrder.discountValue));
	if (!isNaN(customOrder.discount))
		$('#totalDiscount').val(parseFloat(customOrder.discount));
	if (customOrder.shippingMethod)
		$('#shippingOptions').val(customOrder.shippingMethod);
	if (!isNaN(customOrder.shipping))
		$('#shippingValue').val(parseFloat(customOrder.shipping));
	if (!isNaN(customOrder.tax))
		$('#taxOptions').val(parseFloat(customOrder.tax));
	if (customOrder.poNumber)
		$('#poNumber').val(customOrder.poNumber);
	$('#notesArea').val(customOrder.comments);
}

function addItemToOrder() {
	theItem.quantity = $('#itemQuantity').val();
	theItem.salesPrice = $('#itemPrice').val();
	itemsInOrder.push(theItem);
	addItemRow(theItem);
	theItem = {};
	$('#addItemButton').prop('disabled', 'disabled');
	emptyItemLine();
	$('#itemSKU').focus();
	calculateTotals();
}

function fillItemLine(item) {
	$('#itemName').val(item.name);
	var price = determineItemPrice(item);
	$('#itemPrice').val(price.toFixed(2));
}

function determineItemPrice(item) {
	console.log(item);
	console.log(theCustomer);
	var price = 0;

	if (originalCSV) { // check to see if there were prices in the spreadsheet
		if (originalCSV[0].hasOwnProperty('price')) { // if price wasn't included in the csv then skip it
			// loop through the list of items until we find the corresponding one
			for (var i = 0; i < originalCSV.length; i++) {
				if (item.sku == originalCSV[i].sku) {
					return parseFloat(originalCSV[i].price);
				}
			}
		}
	}

	if (theCustomer.marketplace) {
		console.log('new way');
		if (theCustomer.profile == 'wholesale' || theCustomer.profile == 'craftershome' || theCustomer.profile == 'preferredwholesale') { // wholesale
			return item.marketplaceProperties.wholesalePrice[theCustomer.marketplace];
		} else {
			return item.marketplaceProperties.price[theCustomer.marketplace];
		}
	} else {
		return oldDetermineItemPrice(item);
	}
}

function oldDetermineItemPrice(item) {
	let price = 0;
	if (theCustomer.website == 'can') {
		if (item.onSale) {
			price = item.canSalePrice;
		} else {
			price = item.canPrice;
		}
	}
	else {
		if (item.onSale) {
			price = item.usSalePrice;
		} else {
			price = item.usPrice;
		}
	}

	if (theCustomer.profile == 'wholesale' || theCustomer.profile == 'craftershome' || theCustomer.profile == 'preferredwholesale') { // wholesale
		if (theCustomer.website == 'can') {
			price = item.canWholesalePrice;
		} else {
			price = item.usWholesalePrice;
		}
	}
	return price;
}

function calculateLineTotal() {
	var quantity = $('#itemQuantity').val();
	var price = $('#itemPrice').val();
	var linePrice = quantity * price;
	$('#lineTotal').val(linePrice.toFixed(2));
}

function addItemRow(item) {
	var row = $('<tr></tr>');
	var sku = $('<td></td>').text(item.sku);
	var name = $('<td></td>').text(item.name);
	var quantity = $('<td></td>').text(item.quantity);
	var salesPrice = parseFloat(item.salesPrice);
	var price = $('<td></td>').text('$'+salesPrice.toFixed(2));
	var lineTotal = item.quantity * item.salesPrice;
	var linePrice = $('<td></td>').text('$'+lineTotal.toFixed(2));

	row.append(sku);
	row.append(name);
	row.append(quantity);
	row.append(price);
	row.append(linePrice);

	row.click(function(e) {
		setItemModalFields(item);
		$('#itemModal').modal();
	});

	$('#orderTableBody').prepend(row);
}

function emptyItemLine() {
	$('#itemSKU').val('');
	$('#itemName').val('');
	$('#itemPrice').val('');
	$('#itemQuantity').val('1');
	$('#lineTotal').val('');
}

function copyBillingToShipping() {
	$('#shipmentFirstName').val($('#customerFirstName').val());
	$('#shipmentLastName').val($('#customerLastName').val());
	$('#shipmentCompany').val($('#customerCompany').val());
	$('#shipmentPhone').val($('#customerPhone').val());
	$('#shippingAddress').val($('#billingAddress').val());
	$('#shippingAddress2').val($('#billingAddress2').val());
	$('#shippingCity').val($('#billingCity').val());
	$('#shippingState').val($('#billingState').val());
	$('#shippingCountry').val($('#billingCountry').val());
	$('#shippingZip').val($('#billingZip').val());
}

function saveCustomer() {
	$('#customerModal').modal('hide');

	// save the customer to the database
	theCustomer.companyName = $('#companyName').val();
	theCustomer.firstname = $('#customerFirstName').val();
	theCustomer.lastname = $('#customerLastName').val();
	theCustomer.email = $('#customerEmailModal').val();
	theCustomer.phone = $('#customerPhone').val();
	theCustomer.billingAddress = $('#billingAddress').val();
	theCustomer.billingAddress2 = $('#billingAddress2').val();
	theCustomer.billingCity = $('#billingCity').val();
	theCustomer.billingState = $('#billingState').val();
	theCustomer.billingCountry = $('#billingCountry').val();
	theCustomer.billingZipCode = $('#billingZip').val();
	theCustomer.shipmentFirstName = $('#shipmentFirstName').val();
	theCustomer.shipmentLastName = $('#shipmentLastName').val();
	theCustomer.shipmentPhone = $('#shipmentPhone').val();
	theCustomer.shipmentCompany = $('#shipmentCompany').val();
	theCustomer.shippingAddress = $('#shippingAddress').val();
	theCustomer.shippingAddress2 = $('#shippingAddress2').val();
	theCustomer.shippingCity = $('#shippingCity').val();
	theCustomer.shippingState = $('#shippingState').val();
	theCustomer.shippingCountry = $('#shippingCountry').val();
	theCustomer.shippingZipCode = $('#shippingZip').val();
	theCustomer.profile = $('#profileSelect').val();
	theCustomer.website = $('#websiteSelect').val();
	theCustomer.marketplace = $('#marketplaceSelect').val();

	if (theCustomer.profile == 'preferredretail') {
		$('#discountType').val('percentage');
		$('#discount').val('15');
	} else if (theCustomer.profile == 'premier') {
		$('#discountType').val('percentage');
		$('#discount').val('5');
		$('#shippingOptions').val('free shipping');
	} else if (theCustomer.profile == 'craftershome') {
		$('#discountType').val('percentage');
		$('#discount').val('5');
		$('#shippingOptions').val('free shipping');
	} else if (theCustomer.profile == 'preferredwholesale') {
		$('#discountType').val('percentage');
		$('#discount').val('15');
	}

	calculateTotals();
	addCustomerRow(theCustomer);
}

function addCustomerRow(customer) {
	// add the row to the table
	$('#customerTableBody').empty();
	var row = $('<tr></tr>');
	var name = $('<td></td>').text(customer.firstname + ' ' + customer.lastname);
	var email = $('<td></td>').text(customer.email);
	var phone = $('<td></td>').text(customer.phone);
	var address = $('<td></td>').text(customer.shippingAddress);
	var city = $('<td></td>').text(customer.shippingCity);

	row.append(name);
	row.append(email);
	row.append(phone);
	row.append(address);
	row.append(city);

	row.click(function(e) {
		setCustomerModalFieldsNew();
		$('#customerModal').modal();
	});

	$('#customerTableBody').append(row);
}

function setCustomerFieldsNew() {
	$('#companyName').val(theCustomer.companyName);
	$('#customerFirstName').val(theCustomer.firstname);
	$('#customerLastName').val(theCustomer.lastname);
	$('#customerEmailModal').val(theCustomer.email);
	$('#customerPhone').val(theCustomer.phone);
	$('#billingAddress').val(theCustomer.billingAddress);
	$('#billingAddress2').val(theCustomer.billingAddress2);
	$('#billingCity').val(theCustomer.billingCity);
	$('#billingState').val(theCustomer.billingState);
	$('#billingCountry').val(theCustomer.billingCountry);
	$('#billingZip').val(theCustomer.billingZipCode);
	$('#shipmentFirstName').val(theCustomer.shipmentFirstName);
	$('#shipmentLastName').val(theCustomer.shipmentLastName);
	$('#shipmentPhone').val(theCustomer.shipmentPhone);
	$('#shipmentCompany').val(theCustomer.shipmentCompany);
	$('#shippingAddress').val(theCustomer.shippingAddress);
	$('#shippingAddress2').val(theCustomer.shippingAddress2);
	$('#shippingCity').val(theCustomer.shippingCity);
	$('#shippingState').val(theCustomer.shippingState);
	$('#shippingCountry').val(theCustomer.shippingCountry);
	$('#shippingZip').val(theCustomer.shippingZipCode);
	$('#profileSelect').val(theCustomer.profile);
	$('#websiteSelect').val(theCustomer.website);
	$('#marketplaceSelect').val(theCustomer.marketplace);
}

function setCustomerModalFields(customer) {
	$('#customerName').val(customer.name);
	$('#customerFirstName').val(customer.firstname);
	$('#customerLastName').val(customer.lastname);
	$('#customerEmailModal').val(customer.email);
	$('#customerPhone').val(customer.phone);
	$('#billingAddress').val(customer.billingAddress);
	$('#billingAddress2').val(customer.billingAddress2);
	$('#billingCity').val(customer.billingCity);
	$('#billingState').val(customer.billingState);
	$('#billingCountry').val(customer.billingCountry);
	$('#billingZip').val(customer.billingZipCode);
	$('#shipmentFirstName').val(customer.firstname);
	$('#shipmentLastName').val(customer.lastname);
	$('#shipmentCompany').val(customer.companyName);
	$('#shipmentPhone').val(customer.phone);
	$('#shippingAddress').val(customer.shippingAddress);
	$('#shippingAddress2').val(customer.shippingAddress2);
	$('#shippingCity').val(customer.shippingCity);
	$('#shippingState').val(customer.shippingState);
	$('#shippingCountry').val(customer.shippingCountry);
	$('#shippingZip').val(customer.shippingZipCode);
	if (customer.marketplace)
		$('#marketplaceSelect').val(customer.marketplace);

	if (customer.canadian) {
		if (customer.customerType == '0') {
			$('#profileSelect').val('retail');
		} else if (customer.customerType == '14') {
			$('#profileSelect').val('wholesale');
		} else if (customer.customerType == '19') {
			$('#profileSelect').val('premier');
		} else if (customer.customerType == '22') {
			$('#profileSelect').val('craftershome');
		} else if (customer.customerType == '3') {
			$('#profileSelect').val('preferredretail');
		} else if (customer.customerType == '21') {
			$('#profileSelect').val('preferredwholesale');
		} 
	} else {
		if (customer.customerType == '0') {
			$('#profileSelect').val('retail');
		} else if (customer.customerType == '2') {
			$('#profileSelect').val('wholesale');
		} else if (customer.customerType == '18') {
			$('#profileSelect').val('premier');
		} else if (customer.customerType == '21') {
			$('#profileSelect').val('craftershome');
		} else if (customer.customerType == '3') {
			$('#profileSelect').val('preferredretail');
		} else if (customer.customerType == '20') {
			$('#profileSelect').val('preferredwholesale');
		}
	}

	if (customer.website) {
		$('#websiteSelect').val(customer.website);
	} else {
		$('#websiteSelect').val(customer.canadian ? 'can' : 'us');
	}

	if (customer.profile) {
		$('#profileSelect').val(customer.profile);	
	}
}

function populateCustomerInfo(customer) {
	console.log(customer);
	$('#customerEmailModal').val(customer.Email);
	$('#customerName').val(customer.BillingFirstName + customer.BillingLastName);
	$('#companyName').val(customer.ShippingCompany);
	$('#customerFirstName').val(customer.BillingFirstName);
	$('#customerLastName').val(customer.BillingLastName);
	$('#customerPhone').val(customer.BillingPhoneNumber);
	$('#billingAddress').val(customer.BillingAddress1);
	$('#billingAddress2').val(customer.BillingAddress2);
	$('#billingCity').val(customer.BillingCity);
	$('#billingState').val(customer.BillingState);
	$('#billingCountry').val(customer.BillingCountry);
	$('#billingZip').val(customer.BillingZipCode);
	$('#shipmentFirstName').val(customer.ShippingFirstName);
	$('#shipmentLastName').val(customer.ShippingLastName);
	$('#shipmentCompany').val(customer.ShippingCompany);
	$('#shipmentPhone').val(customer.ShippingPhoneNumber);
	$('#shippingAddress').val(customer.ShippingAddress1);
	$('#shippingAddress2').val(customer.ShippingAddress2);
	$('#shippingCity').val(customer.ShippingCity);
	$('#shippingState').val(customer.ShippingState);
	$('#shippingCountry').val(customer.ShippingCountry);
	$('#shippingZip').val(customer.ShippingZipCode);
	$('#profileSelect').val(customer.CustomerGroupID);
}

function setItemModalFields(item) {
	theEditItem = item;
	$('#itemNameTitle').text(item.name);
	$('#itemSKUModal').val(item.sku);
	$('#itemNameModal').val(item.name);
	$('#itemQuantityModal').val(item.quantity);
	$('#itemPriceModal').val(item.salesPrice);

	if (item.usSalePrice != undefined) {
		$('#usSalePrice').val(item.usSalePrice.toFixed(2));
	} else {
		$('#usSalePrice').val(0.00);
	}
	if (item.canSalePrice != undefined) {
		$('#canSalePrice').val(item.canSalePrice.toFixed(2));
	} else {
		$('#canSalePrice').val(0.00);
	}

	$('#itemImage').attr('src', 'https://ecstasycrafts.com/'+item.imageURL);
	$('#stock').val(item.stock);
	$('#usStock').val(item.usStock);
	$('#canStock').val(item.canStock);
	$('#location').val(item.location);
	$('#barcode').val(item.barcode);
	$('#country').val(item.countryOfOrigin);
	$('#onSale').prop('checked', item.onSale === true);
	$('#viewOnUSWebsite').attr('href', item.usLink);
	$('#viewOnCanWebsite').attr('href', item.canLink);
}

function saveItem() {
	theEditItem.quantity = $('#itemQuantityModal').val();
	theEditItem.name = $('#itemNameModal').val();
	theEditItem.salesPrice = $('#itemPriceModal').val();
	buildOrderTable();
	$('#itemModal').modal('hide');
}

function buildOrderTable() {
	$('#orderTableBody').empty();
	itemsInOrder.forEach(function(item) {
		addItemRow(item);
	});
}

function calculateTax(subtotal) {
	let salesTax = 0;
	if (theCustomer.billingCountry == 'CA') {
    if (theCustomer.billingState == 'ON') {
      salesTax = 0.13;
    } else if (theCustomer.billingState == 'AB' ||
      theCustomer.billingState == 'NU' ||
      theCustomer.billingState == 'NT' ||
      theCustomer.billingState == 'MB' ||
      theCustomer.billingState == 'YT') {
      salesTax = 0.05;
    } else if (theCustomer.billingState == 'BC') {
      salesTax = 0.05;
    } else if (theCustomer.billingState == 'NB' ||
      theCustomer.billingState == 'NL' ||
      theCustomer.billingState == 'PE' ||
      theCustomer.billingState == 'NS') {
      salesTax = 0.15;
    } else if (theCustomer.billingState == 'SK') {
      salesTax = 0.05;
    } else if (theCustomer.billingState == 'QC') {
      salesTax = 0.05;
    }
  }
  return subtotal * salesTax;
}

function calculateTotals() {
	var tax = 0;
	var subTotal = 0;
	var total = 0;
	var discount = 0;
	var shipping = 0;

	itemsInOrder.forEach(function(item) {
		var itemTotal = item.quantity * item.salesPrice;
		subTotal += itemTotal;
	});

	var discountType = $('#discountType').val();
	var discountValue = parseFloat($('#discount').val());
	var discPercentage = 0;
	if (discountType == 'percentage') {
		var discPercentage = parseFloat($('#discount').val());
		if (discountValue > 0) {
			discPercentage = discountValue / 100;
		} else {
			discPercentage = 0;
		}
		discount = subTotal * discPercentage;
	} else {
		discount = discountValue;
	}

	calculateShipping(subTotal - discount);

	shipping = parseFloat($('#shipping').val());
	var salesTax = calculateTax(subTotal - discount + shipping);
	total = subTotal - discount + salesTax + shipping;

	$('#subTotalTable').text('$'+subTotal.toFixed(2));
	$('#totalDiscount').val(discount.toFixed(2));
	$('#taxes').val(salesTax.toFixed(2));
	$('#total').val(total.toFixed(2));

	theOrder.total = total.toFixed(2);
	theOrder.subTotal = subTotal.toFixed(2);
	theOrder.discount = discount.toFixed(2);
	theOrder.tax = salesTax.toFixed(2);
	theOrder.shipping = shipping.toFixed(2);
	theOrder.shippingMethod = $('#shippingOptions').val();
	theOrder.discountValue = discountValue;
}

function calculateShipping(subtotal) {
	let shippingMethod = $('#shippingOptions').val();
	if (shippingMethod == 'Free Shipping') {
		return $('#shipping').val(0);
	}
	if (theCustomer.profile == 'premier' ||
		theCustomer.profile == 'preferredwholesale' ||
		(theCustomer.shippingCountry == 'CA' && subtotal > 150 && theCustomer.profile == 'retail') ||
		(theCustomer.shippingCountry == 'US' && subtotal > 100) && theCustomer.profile == 'retail') {
		$('#shippingOptions').val('Free Shipping');
		$('#shipping').val(0);
		return;
	} else if ((theCustomer.profile == 'wholesale' || theCustomer.profile == 'craftershome') && subtotal > 500) {
		$('#shippingOptions').val('Free Shipping');
		$('#shipping').val(0);
		return;
	}

	if (theCustomer.shippingCountry == 'CA') {
		if (theCustomer.profile == 'wholesale' || theCustomer.profile == 'craftershome') {
			if (shippingMethod == 'UPS') {
				if (subtotal < 100) {
					return $('#shipping').val(15);
				} else if (subtotal < 200) {
					return $('#shipping').val(17);
				} else if (subtotal < 250) {
					return $('#shipping').val(20);
				} else if (subtotal < 500) {
					return $('#shipping').val(15);
				} else {
					return $('#shipping').val(0);
				}
			} else if (shippingMethod == 'Canada Post') {
				if (subtotal < 150) {
					return $('#shipping').val(15);
				} else if (subtotal < 250) {
					return $('#shipping').val(20);
				} else if (subtotal < 500) {
					return $('#shipping').val(15);
				}
			}
		} else {
			if (shippingMethod == 'Canada Post') {
				if (subtotal < 15) {
					return $('#shipping').val(5);
				} else if (subtotal < 25) {
					return $('#shipping').val(6);
				} else if (subtotal < 40) {
					return $('#shipping').val(7.5);
				} else if (subtotal < 50) {
					return $('#shipping').val(8);
				} else if (subtotal < 60) {
					return $('#shipping').val(9);
				} else if (subtotal < 150) {
					return $('#shipping').val(11);
				}
			}
		}
	} else if (theCustomer.shippingCountry == 'US') {
		if (theCustomer.profile == 'wholesale' || theCustomer.profile == 'craftershome') {
			if (shippingMethod == 'UPS') {
				if (subtotal < 150) {
					return $('#shipping').val(15.50);
				} else if (subtotal < 250) {
					return $('#shipping').val(18);
				} else {
					return $('#shipping').val(15);
				}
			} else if (shippingMethod == 'Priority Mail') {
				if (subtotal < 100) {
					return $('#shipping').val(10);
				} else if (subtotal < 200) {
					return $('#shipping').val(15);
				} else if (subtotal < 250) {
					return $('#shipping').val(18);
				} else if (subtotal < 500) {
					return $('#shipping').val(15);
				} else {
					return $('#shipping').val(0);
				}
			}
		} else {
			if (shippingMethod == 'Priority Mail') {
				if (subtotal < 25) {
					return $('#shipping').val(5.5);
				} else if (subtotal < 40) {
					return $('#shipping').val(7);
				} else if (subtotal < 50) {
					return $('#shipping').val(7.5);
				} else if (subtotal < 60) {
					return $('#shipping').val(8);
				} else if (subtotal < 75) {
					return $('#shipping').val(8.5);
				} else if (subtotal < 85) {
					return $('#shipping').val(9);
				} else if (subtotal < 100) {
					return $('#shipping').val(9.5);
				} else {
					return $('#shipping').val(0);
				}
			}
		}
	}
}

function generateOrder() {
	calculateTotals();
	theOrder.customer = theCustomer;
	theOrder.items = itemsInOrder;
	theOrder.comments = $('#notesArea').val();
	theOrder.poNumber = $('#poNumber').val();
	theOrder.discountType = $('#discountType').val();
	return theOrder;
}