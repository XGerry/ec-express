var socket = io();
var theOrder = {};
var oldRow = {};
var rowsToSave = [];

$(document).ready(function() {
	$('#getOrdersButton').click(() => {
		$('#getOrdersButton').button('loading');
		socket.emit('loadOrdersForManifest', {orderstatus: 4, limit: 2}, 'US');
	});

	$('#doneEditingButton').click(e => {
		// save new HTCs
		rowsToSave.forEach(fn => {
			fn();
		});
		recalculateTotals(theOrder);
		saveShippingInfo(theOrder);
		if (oldRow)
			oldRow.remove();
		addManifestRow(theOrder);
		$('#orderModal').modal('hide');
	});

	$('#newOrderButton').click(e => {
		var newOrder = {
			ShipmentList: [{
				ShipmentFirstName: '',
				ShipmentLastName: '',
				BillingEmail: '',
				ShipmentPhone: '',
				ShipmentAddress: '',
				ShipmentAddress2: '',
				ShipmentCity: '',
				ShipmentState: '',
				ShipmentCountry: '',
				ShipmentZipCode: ''
			}],
			htcMap: {
				'12345': {
					'Canada': {
						quantity: 5,
						value: 5
					}
				}
			}
		};
		recalculateTotals(newOrder);
		theOrder = newOrder;
		oldRow = null;
		populateOrderModal(newOrder);
		$('#orderModal').modal();
	});

	$('#addHTCRowButton').click(e => {
		addEditableHTCRow();
	});
});

socket.on('loadOrdersFinished', (response) => {
	$('#getOrdersButton').button('reset');
	console.log(response);
	buildManifest(response);
});

function recalculateTotals(order) {
	var newTotalQuantity = 0;
	var newTotalValue = 0;

	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var quantity = cooObj.quantity;
			var value = cooObj.value;
			newTotalQuantity += quantity;
			newTotalValue += value;
		}
	}

	order.totalItems = newTotalQuantity;
	order.totalValue = newTotalValue;
}

function saveShippingInfo(order) {
	var shipmentInfo = order.ShipmentList[0];
	shipmentInfo.ShipmentFirstName = $('#customerFirstName').val();
	shipmentInfo.ShipmentLastName = $('#customerLastName').val();
	shipmentInfo.BillingEmail = $('#customerEmailModal').val();
	shipmentInfo.ShipmentPhone = $('#customerPhone').val();
	shipmentInfo.ShipmentAddress = $('#shippingAddress').val();
	shipmentInfo.ShipmentAddress2 = $('#shippingAddress2').val();
	shipmentInfo.ShipmentCity = $('#shippingCity').val();
	shipmentInfo.ShipmentState = $('#shippingState').val();
	shipmentInfo.ShipmentCountry = $('#shippingCountry').val();
	shipmentInfo.ShipmentZipCode = $('#shippingZip').val();
}

function buildManifest(orders) {
	$('#manifest').empty();

	orders.forEach((order) => {
		addManifestRow(order);
	});
}

function addManifestRow(order) {
	var row = $('<div class="row"></div>');
	var innerCol = $('<div class="col-lg-12"></div>');
	var panel = $('<div class="panel"></div>');
	var panelHeading = $('<div class="panel-heading"></div>');
	var panelBody = $('<div class="panel-body"></div>');
	var panelRow = $('<div class="row"></div>');
	var addressCol = $('<div class="col-lg-4 col-md-4 col-sm-4"></div>');
	var orderDetailCol = $('<div class="col-lg-8 col-md-8 col-sm-8"></div>');

	var invoiceID = order.InvoiceNumberPrefix + order.InvoiceNumber;
	panelHeading.append($('<h4 style="display: inline-block;">'+invoiceID+'</h4>'));
	var buttonGroup = $('<div class="btn-toolbar pull-right hide-printer"></div>');
	var editButton = $('<button class="btn btn-default" type="button">Edit</button>');
	var removeButton = $('<button class="btn btn-danger" type="button">Remove</button>');
	buttonGroup.append(editButton);
	buttonGroup.append(removeButton);
	panelHeading.append(buttonGroup);

	// Address Info
	var shipmentInfo = order.ShipmentList[0];
	var addressInfo = $('<address></address>');
	var html = '';
	if (shipmentInfo.ShipmentCompany != '') {
		html += '<strong>' + shipmentInfo.ShipmentCompany + '</strong><br>'; 
	}
	html += '<strong>' + shipmentInfo.ShipmentFirstName + ' ' + shipmentInfo.ShipmentLastName + '</strong><br>';
	html += shipmentInfo.ShipmentAddress + '<br>';
	if (shipmentInfo.ShipmentAddress2 != '') {
		html += shipmentInfo.ShipmentAddress2 + '<br>';
	}
	html += shipmentInfo.ShipmentCity + '<br>';
	html += shipmentInfo.ShipmentState + '<br>';
	html += shipmentInfo.ShipmentZipCode + '<br>';
	html += shipmentInfo.ShipmentCountry + '<br>';

	addressInfo.html(html);
	addressCol.append(addressInfo);

	// Item Info
	var orderDetailTable = $('<table class="table table-striped table-condensed"></table>');
	var tableHeader = $('<thead></thead>');
	var tableHeaderRow = $('<tr></tr>');
	tableHeaderRow.append('<th>HTC Code</th>');
	tableHeaderRow.append('<th>Country of Origin</th>');
	tableHeaderRow.append('<th>Quantity</th>');
	tableHeaderRow.append('<th>Value</th>');
	tableHeader.append(tableHeaderRow);

	var tableBody = $('<tbody></tbody>');
	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var detailRow = generateOrderDetailRow(htcCode, country, cooObj.quantity, cooObj.value);
			tableBody.append(detailRow);
		}
	}

	var tableFooter = $('<tfoot></tfoot>');
	var tableFooterRow = $('<tr></tr>');
	tableFooterRow.append($('<th></th>'));
	tableFooterRow.append($('<th>Total</th>'));
	tableFooterRow.append($('<th>' + order.totalItems + '</th>'));
	tableFooterRow.append($('<th>$' + order.totalValue.toFixed(2) + '</th>'));
	tableFooter.append(tableFooterRow);

	orderDetailTable.append(tableHeader);
	orderDetailTable.append(tableBody);
	orderDetailTable.append(tableFooter);

	orderDetailCol.append(orderDetailTable);

	panelRow.append(addressCol);
	panelRow.append(orderDetailCol);

	panelBody.append(panelRow);
	panel.append(panelHeading);
	panel.append(panelBody);

	innerCol.append(panel);
	row.append(innerCol);

	if (order.totalValue > 800) {
		panel.addClass('panel-danger');
	} else {
		panel.addClass('panel-default');
	}

	$('#manifest').prepend(row);

	// Button Events
	editButton.click(e => {
		oldRow = row;
		populateOrderModal(order);
		$('#orderModal').modal();
	});

	removeButton.click(e => {
		row.remove();
	});
}

function generateOrderDetailRow(htc, country, quantity, value) {
	var tableRow = $('<tr></tr>');
	var htcCol = $('<td></td>');
	htcCol.text(htc);
	var cooCol = $('<td></td>');
	cooCol.text(country);
	var quantityCol = $('<td></td>');
	quantityCol.text(quantity);
	var valueCol = $('<td></td>');
	valueCol.text('$' + value.toFixed(2));

	tableRow.append(htcCol);
	tableRow.append(cooCol);
	tableRow.append(quantityCol);
	tableRow.append(valueCol);

	return tableRow;
}

function populateOrderModal(order) {
	theOrder = order;

	$('#invoicePrefix').val(order.InvoiceNumberPrefix);
	$('#invoiceNumber').val(order.InvoiceNumber);

	var shipmentInfo = order.ShipmentList[0];
	$('#customerFirstName').val(shipmentInfo.ShipmentFirstName);
	$('#customerLastName').val(shipmentInfo.ShipmentLastName);
	$('#customerEmailModal').val(order.BillingEmail);
	$('#customerPhone').val(shipmentInfo.ShipmentPhone);

	$('#shippingAddress').val(shipmentInfo.ShipmentAddress);
	$('#shippingAddress2').val(shipmentInfo.ShipmentAddress2);
	$('#shippingCity').val(shipmentInfo.ShipmentCity);
	$('#shippingState').val(shipmentInfo.ShipmentState);
	$('#shippingCountry').val(shipmentInfo.ShipmentCountry);
	$('#shippingZip').val(shipmentInfo.ShipmentZipCode);

	$('#itemDetailModal').empty();
	rowsToSave =[];
	populateHTCTable(order);
}

function populateHTCTable(order) {
	for (htcCode in order.htcMap) {
		var htcObj = order.htcMap[htcCode];
		for (country in htcObj) {
			var cooObj = htcObj[country];
			var quantity = cooObj.quantity;
			var value = cooObj.value;
			var htcRow = buildHTCTableRow(htcCode, country, quantity, value, order.htcMap);
			$('#itemDetailModal').append(htcRow);
		}
	}
}

function addEditableHTCRow() {
	var row = $('<div class="row"></div>');
	var htcCol = $('<div class="col-lg-3 form-group"></div>'); 
	var cooCol = $('<div class="col-lg-4 form-group"></div>'); 
	var quantityCol = $('<div class="col-lg-2 form-group"></div>'); 
	var valueCol = $('<div class="col-lg-3 form-group"></div>'); 

	var htcInput = $('<input type="text" class="form-control">');
	var cooInput = $('<input type="text" class="form-control">');
	var quantityInput = $('<input type="number" class="form-control">');
	var valueInput = $('<input type="number" class="form-control">');

	htcCol.append(htcInput);
	cooCol.append(cooInput);
	quantityCol.append(quantityInput);
	valueCol.append(valueInput);

	row.append(htcCol);
	row.append(cooCol);
	row.append(quantityCol);
	row.append(valueCol);

	$('#itemDetailModal').append(row);

	function saveNewHTCRow() {
		var htc = htcInput.val();
		console.log(htc);
		var coo = cooInput.val().toUpperCase();
		var quantity = parseInt(quantityInput.val());
		var value = parseFloat(valueInput.val());
		addHTCtoMap(htc, coo, quantity, value);
	}
	rowsToSave.push(saveNewHTCRow);
}

function addHTCtoMap(htc, coo, quantity, value) {
	var htcMap = theOrder.htcMap;
	if (!htcMap.hasOwnProperty(htc)) {
    htcMap[htc] = {};
  }
  var htcObj = htcMap[htc];
  if (!htcObj.hasOwnProperty(coo)) {
    htcObj[coo] = {
      quantity: 0,
      value: 0
    };
  }
  htcMap[htc][coo].quantity = quantity;
  htcMap[htc][coo].value = value;
}

function buildHTCTableRow(htc, coo, quantity, value, htcMap) {
	var row = $('<div class="row"></div>');
	var htcCol = $('<div class="col-lg-3 form-group"></div>'); 
	var cooCol = $('<div class="col-lg-4 form-group"></div>'); 
	var quantityCol = $('<div class="col-lg-2 form-group"></div>'); 
	var valueCol = $('<div class="col-lg-3 form-group"></div>');

	htcCol.text(htc);
	cooCol.text(country);

	var quantityInput = $('<input type="number" class="form-control">');
	quantityInput.val(quantity);
	var valueInput = $('<input type="number" class="form-control">');
	valueInput.val(value.toFixed(2));

	quantityCol.append(quantityInput);
	valueCol.append(valueInput);

	row.append(htcCol);
	row.append(cooCol);
	row.append(quantityCol);
	row.append(valueCol);

	// events
	quantityInput.on('change', e => {
		console.log('input changed');
		var newQuantity = parseInt(quantityInput.val());
		htcMap[htc][coo].quantity = newQuantity;
		console.log(htcMap);
	});

	valueInput.on('change', e => {
		var newValue = parseFloat(valueInput.val());
		htcMap[htc][coo].value = newValue;
	});

	return row;
}