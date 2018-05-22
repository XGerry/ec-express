var socket = io();

var theItem = {};
var theEditItem = {};
var itemsInPO = [];
var thePO = {};
var theDelivery = {};

$(document).ready(e => {
	socket.emit('getDeliveries', deliveries => {
		buildDeliveryTable(deliveries);
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

	$('#itemQuantity').change(function(e) {
		calculateLineTotal();
	});

	$('#itemCost').change(function(e) {
		calculateLineTotal();
	});

	$('#lineTotal').on('keydown', e => {
		if (e.keyCode == 9) { // tab
			e.preventDefault();
			addItemToOrder();
		}
	});

	$('#saveItemButton').click(e => {
		saveItemFields(theItem);
		calculateTotals();
	});

	socket.emit('getManufacturers', true);

	$('#savePOButton').click(e => {
		savePO();
	});

	$('#addDeliveryButton').click(e => {
		socket.emit('getDeliveries', deliveries => {
			buildDeliveryTable(deliveries);
		});
		$('#deliveryModal').modal();
	});
});

socket.on('searchFinished', function(items) {
	// just want the first item
	if (items.length == 0) {
		socket.emit('searchSKU', $('#itemSKU').val());
		$('#itemSKU').focus();
	} else {
		var item = items[0];
		fillItemLine(item);
		calculateLineTotal();
		theItem = item;
	}
});

socket.on('getManufacturersFinished', response => {
	manufacturerNames = response.map(x => {return x.ManufacturerName});
	manufacturerNames.sort();
	$('#manufacturer').empty();
	manufacturerNames.forEach(name => {
		$('#manufacturer').append($('<option></option>').prop('value', name).text(name));
	});
});

function saveItemFields() {
	theEditItem.quantity = $('#itemQuantityModal').val();
	theEditItem.purchaseCost = $('#itemCostModal').val();
	buildOrderTable();
	$('#itemModal').modal('hide');
}

function fillItemLine(item) {
	$('#itemName').val(item.name);
	$('#itemCost').val(item.cost);
}

function calculateLineTotal() {
	var quantity = $('#itemQuantity').val();
	var cost = $('#itemCost').val();
	var linePrice = quantity * cost;
	$('#lineTotal').val(linePrice.toFixed(2));
}

function buildOrderTable() {
	$('#orderTableBody').empty();
	itemsInPO.forEach(function(item) {
		addItemRow(item);
	});
}

function addItemToOrder() {
	theItem.quantity = $('#itemQuantity').val();
	theItem.purchaseCost = $('#itemCost').val();
	itemsInPO.push(theItem);
	addItemRow(theItem);
	theItem = {};
	$('#addItemButton').prop('disabled', 'disabled');
	emptyItemLine();
	$('#itemSKU').focus();
	calculateTotals();
}

function emptyItemLine() {
	$('#itemSKU').val('');
	$('#itemName').val('');
	$('#itemCost').val('');
	$('#itemQuantity').val('1');
	$('#lineTotal').val('');
}

function addItemRow(item) {
	var row = $('<tr></tr>');
	var sku = $('<td></td>').text(item.sku);
	var name = $('<td></td>').text(item.name);
	var quantity = $('<td></td>').text(item.quantity);
	var purchaseCost = parseFloat(item.purchaseCost);
	var price = $('<td></td>').text('$'+purchaseCost.toFixed(2));
	var lineTotal = item.quantity * item.purchaseCost;
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

function setItemModalFields(item) {
	theEditItem = item;
	$('#itemNameTitle').text(item.name);
	$('#itemSKUModal').val(item.sku);
	$('#itemNameModal').val(item.name);
	$('#itemQuantityModal').val(item.quantity);
	$('#itemCostModal').val(item.purchaseCost);

	$('#itemImage').attr('src', 'https://ecstasycrafts.com/'+item.imageURL);
	$('#stock').val(item.stock);
	$('#usStock').val(item.usStock);
	$('#canStock').val(item.canStock);
}

function calculateTotals() {
	var subTotal = 0;
	itemsInPO.forEach(function(item) {
		var itemTotal = item.quantity * item.purchaseCost;
		subTotal += itemTotal;
	});

	$('#subTotalTable').text('$' + subTotal.toFixed(2));
}

function savePO() {
	thePO.items = itemsInPO;
	thePO.poNumber = $('#referenceId').val();
	thePO.manufacturer = $('#manufacturer').val();
	thePO.delivery = theDelivery;
	thePO.status = $('#poStatus').val();
	socket.emit('savePO', thePO, savedPO => {
		thePO = savedPO;
		$('#poInfo').text('Saved the PO.');
		setTimeout(() => {
			$('#poInfo').text('');
		}, 3000);
	});
}

function buildDeliveryTable(deliveries) {
	$('#deliveryModalTable').empty();
	deliveries.forEach(delivery=> {
		var row = $('<tr></tr>');
		var name = $('<td></td>').text(delivery.name);
		var manufacturer = $('<td></td>').text(delivery.manufacturer);
		var date = $('<td></td>').text(moment(delivery.date).utc().format('MMM Do'));
		row.append(name).append(manufacturer).append(date);
		$('#deliveryModalTable').append(row);

		row.click(e => {
			$('#deliveryModal').modal('hide');
			theDelivery = delivery;
			addDeliveryRow(theDelivery);
		});
	});
}

function addDeliveryRow(delivery) {
	$('#deliveryTableBody').empty();
	var row = $('<tr></tr>');
	var name = $('<td></td>').text(delivery.name);
	var manufacturer = $('<td></td>').text(delivery.manufacturer);
	var date = $('<td></td>').text(moment(delivery.date).utc().format('MMM Do'));
	var status = $('<td></td>').text(delivery.status);
	row.append(name).append(manufacturer).append(date).append(status);
	$('#deliveryTableBody').append(row);
}

function loadPO(po) {
	if (po) {
		thePO = po;
		itemsInPO = po.items;
		po.items.forEach(item => {
			addItemRow(item);
		});
		calculateTotals();
		$('#referenceId').val(po.poNumber);
		$('#manufacturer').val(po.manufacturer);
		$('#poStatus').val(po.status);
		if (po.delivery) {
			theDelivery = po.delivery;
			addDeliveryRow(po.delivery);
		}
	}
}