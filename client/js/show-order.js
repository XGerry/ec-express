var socket = io();
var order = []; // the list of items

$(document).ready(function() {
	$('#orderAlert').hide();

	$('#decreaseQuantity').click(function() {
		var quantity = $('#itemQuantity').val();
		quantity--;
		if (quantity < 1) {
			quantity = 1;
		}
		$('#itemQuantity').val(quantity);
	});


	$('#increaseQuantity').click(function() {
		var quantity = $('#itemQuantity').val();
		quantity++;
		$('#itemQuantity').val(quantity);
	});

	$('#addItemButton').click(function() {
		var sku = $('#itemSKU').val();
		var quantity = $('#itemQuantity').val();
		addItemToOrder(sku, quantity);
	});

	$('#subtotalButton').click(function() {
		console.log(order);
		socket.emit('calculateSubtotal', order);
	});

	$('#dismissAlertButton').click(function() {
		$('#orderAlert').hide();
	});
});

socket.on('calculateSubtotalFinished', function(response) {
	$('#subtotal').text('$' + response.total);
	console.log(response);
	if (response.message != '') {
		console.log('alert');
		$('#alert-message').text(response.message);
		$('#orderAlert').show();
	}
});

function addItemToOrder(sku, quantity) {
	var row = $('<div class="row form-group"></div>');

	var skuInput = $('<input class="form-control input-lg" type="text">');
	sku = sku.toUpperCase();
	skuInput.val(sku);

	var quantityInput = $('<input class="form-control" type="number">');
	quantityInput.val(quantity);

	var skuCol = $('<div class="col-lg-3 col-sm-3"></div>');
	skuCol.append(skuInput);

	var quantityCol = $('<div class="col-lg-3 col-sm-3"></div>');
	var inputGroup = $('<div class="input-group input-group-lg"></div>');

	var inputGroupButtonMinus = $('<span class="input-group-btn"></span>');
	var buttonMinus = $('<button class="btn btn-default"><i class="fa fa-minus"></button>');
	inputGroupButtonMinus.append(buttonMinus);

	var inputGroupButtonPlus = $('<span class="input-group-btn"></span>');
	var buttonPlus = $('<button class="btn btn-default"><i class="fa fa-plus"></button>');
	inputGroupButtonPlus.append(buttonPlus);

	inputGroup.append(inputGroupButtonMinus);
	inputGroup.append(quantityInput);
	inputGroup.append(inputGroupButtonPlus);
	
	var buttonToolbar = $('<div class="btn-toolbar"></div>');
	var duplicateButton = $('<button class="btn btn-info btn-lg" type="button">Duplicate</button>')
	var removeButton = $('<button class="btn btn-danger btn-lg" type="button">&times;</button>')

	buttonToolbar.append(duplicateButton);
	buttonToolbar.append(removeButton);

	var buttonCol = $('<div class="col-lg-4 col-sm-4"></div>');
	buttonCol.append(buttonToolbar);

	quantityCol.append(inputGroup);

	row.append(skuCol);
	row.append(quantityCol);
	row.append(buttonCol);

	$('#orderSheet').prepend(row);

	// add to order
	var item = {
		sku: sku,
		quantity: quantity,
		message: '',
		total: 0
	};
	order.push(item);

	// button events
	removeButton.click(function(e) {
		order.splice(order.indexOf(item), 1);
		row.remove();
	});

	duplicateButton.click(function(e) {
		addItemToOrder(skuInput.val(), quantityInput.val());
	});

	buttonMinus.click(function() {
		var rowQ = quantityInput.val();
		rowQ--;
		if (rowQ < 1) {
			rowQ = 1;
		}
		quantityInput.val(rowQ);
		item.quantity = rowQ;
	});

	buttonPlus.click(function() {
		var rowQ = quantityInput.val();
		rowQ++;
		item.quantity = rowQ;
		quantityInput.val(rowQ);
	});

	skuInput.change(function() {
		var newSku = skuInput.val();
		item.sku = newSku;
	});

	$('#itemSKU').select();
}

