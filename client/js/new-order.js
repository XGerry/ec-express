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
		$('#saveButton').button('loading');
		socket.emit('saveCustomOrder', generateOrder(), true);
	});

	$('#saveOrderButton').click(e => {
		console.log('saving...');
		$('#saveButton').button('loading');
		socket.emit('saveCustomOrder', generateOrder(), false);
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

	$('#searchCustomerButton').click(e => {
		loadingOrder = false;
		var customerEmail = $('#customerEmailModal').val();
		socket.emit('searchCustomer3DCart', customerEmail, $('#websiteSelect').val() == 'canada');
		$('#searchCustomerButton').button('loading');
	});

	$('#findOrderButton').click(function() {
		socket.emit('loadFrom3DCart', $('#orderPrefix').val(), $('#orderNumber').val());
		$('#orderImportModal').modal('hide');
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

socket.on('receivedOrder', function(orders) {
	loadingOrder = true;
	var cartOrder = orders[0];
	console.log(cartOrder);

	var website = cartOrder.InvoiceNumberPrefix == 'CA-' ? 'canada' : 'us';
	var customerEmail = cartOrder.BillingEmail.trim();
	$('#websiteSelect').val(website);
	console.log(website);
	socket.emit('searchCustomer3DCart', customerEmail, website == 'canada');

	itemsInOrder = [];
	cartOrder.OrderItemList.forEach(function(item) {
		var orderItem = {
			name: item.ItemDescription,
			sku: item.ItemID,
			quantity: item.ItemQuantity,
			imageURL: item.ItemImage1,
			salesPrice: item.ItemUnitPrice,
			usStock: item.ItemUnitStock,
			canStock: item.ItemUnitStock,
			location: item.ItemWarehouseLocation
		}
		itemsInOrder.push(orderItem);
	});

	$('#orderStatus').val(cartOrder.OrderStatusID);

	$('#shipping').val(cartOrder.ShipmentList[0].ShipmentCost);
	$('#discountType').val('dollar');
	$('#discount').val(cartOrder.OrderDiscountPromotion);
	$('#notesArea').val(cartOrder.CustomerComments);
	$('#taxes').val(cartOrder.SalesTax);

	if (theCustomer.billingState == 'ON') {
		$('#taxOptions').val(13);
	}
	
	theOrder.items = itemsInOrder;
	theOrder.orderId = cartOrder.OrderID;

	buildOrderTable();
	calculateTotals();
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

socket.on('searchCustomer3DCartFinished', (err, customer) => {
	$('#searchCustomerButton').button('reset');
	if (err) {
		console.log(err);
		$('#emailSearchInfo').text('An error has occurred');
	} else {
		if (customer.length > 0) {
			$('#emailSearchInfo').text(customer.length + ' customer(s) were found.');
			populateCustomerInfo(customer[0]);
			if (loadingOrder) {
				$('#customerEmailModal').val(customer[0].Email);
				saveCustomer();
			}
		} else {
			$('#emailSearchInfo').text('No customers were found.');
		}
	}
});

socket.on('findingItemsFinished', items => {
	items.forEach(item => {
		item.salesPrice = determineItemPrice(item);
		itemsInOrder.push(item);
		addItemRow(item);
	});
	calculateTotals();
});

socket.on('saveCustomOrderFinished', order => {
	theOrder = order;
	$('#saveOrderButton').button('reset');
	var invoiceNumber = order.invoiceNumber;
	console.log(invoiceNumber);
	var message = 'Saved successfully.';
	if (invoiceNumber != undefined) {
		message += ' ' + invoiceNumber;
		$('#orderNavTitle').text(invoiceNumber);
	}
	$('#orderInfo').text(message);
	setTimeout(() => {
		$('#orderInfo').text('');
	}, 5000);
});

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

	if (theCustomer.website == 'canada') {
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

	if (theCustomer.profile == '2' || theCustomer.profile == '14') { // wholesale
		if (theCustomer.website == 'canada') {
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

	$('#orderTableBody').append(row);
}

function emptyItemLine() {
	$('#itemSKU').val('');
	$('#itemName').val('');
	$('#itemPrice').val('');
	$('#itemQuantity').val('1');
	$('#lineTotal').val('');
}

function copyBillingToShipping() {
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
	theCustomer.shippingAddress = $('#shippingAddress').val();
	theCustomer.shippingAddress2 = $('#shippingAddress2').val();
	theCustomer.shippingCity = $('#shippingCity').val();
	theCustomer.shippingState = $('#shippingState').val();
	theCustomer.shippingCountry = $('#shippingCountry').val();
	theCustomer.shippingZipCode = $('#shippingZip').val();
	theCustomer.profile = $('#profileSelect').val();
	theCustomer.website = $('#websiteSelect').val();

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
		setCustomerModalFields(customer);
		$('#customerModal').modal();
	});

	$('#customerTableBody').append(row);
}

function setCustomerModalFields(customer) {
	$('#customerName').val(customer.firstname + customer.lastname);
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
	$('#shippingAddress').val(customer.shippingAddress);
	$('#shippingAddress2').val(customer.shippingAddress2);
	$('#shippingCity').val(customer.shippingCity);
	$('#shippingState').val(customer.shippingState);
	$('#shippingCountry').val(customer.shippingCountry);
	$('#shippingZip').val(customer.shippingZipCode);
	$('#profileSelect').val(customer.profile);
	$('#websiteSelect').val(customer.website);
}

function populateCustomerInfo(customer) {
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

	shipping = parseFloat($('#shipping').val());
	tax = parseFloat($('#taxOptions').val()) / 100;
	var salesTax = tax * (subTotal - discount + shipping);
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

function generateOrder() {
	theOrder.customer = theCustomer;
	theOrder.items = itemsInOrder;
	theOrder.comments = $('#notesArea').val();
	theOrder.poNumber = $('#poNumber').val();
	theOrder.discountType = $('#discountType').val();
	return theOrder;
}