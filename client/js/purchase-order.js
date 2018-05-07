var socket = io();

var theItem = {};
var itemsInOrder = [];

$(document).ready(e => {
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

	socket.emit('getManufacturers', true);
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

socket.on('getManufacturersFinished', response => {
	manufacturerNames = response.map(x => {return x.ManufacturerName});
	$('#manufacturer').empty();
	manufacturerNames.forEach(name => {
		$('#manufacturer').append($('<option></option>').prop('value', name).text(name));
	});
});


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

function addItemToOrder() {
	theItem.quantity = $('#itemQuantity').val();
	theItem.purchaseCost = $('#itemCost').val();
	itemsInOrder.push(theItem);
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
	itemsInOrder.forEach(function(item) {
		var itemTotal = item.quantity * item.purchaseCost;
		subTotal += itemTotal;
	});

	$('#subTotalTable').text('$' + subTotal.toFixed(2));
}