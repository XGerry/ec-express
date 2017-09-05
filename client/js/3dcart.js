var socket = io();

var selectedProducts = [];
var allProducts = [];

socket.on('saveAdvancedOptionsFinished', function(data) {
	console.log('finshed saving options');
	console.log(data);
});

socket.on('updateItemsFinished', function(data) {
	console.log(data);
});

socket.on('getItemsFinished', function(items) {
	console.log(items);
	buildProductTable(items);
	allProducts = items;
});

socket.on('quickbooksFinished', function() {
	console.log('finished the update');
});	

socket.on('getCategoriesFinished', function(responses) {
	console.log(responses);
});

socket.on('updateAllItemsFinished', function(responses) {
	console.log(responses);
});

$(document).ready(function() {
	$('#productTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[1, 'asc']]
	});

	$(".dropdown-toggle").dropdown();

	$('#getProductsButton').click(function(e) {
		selectedProducts = [];
		getItems();
	});

	$('#bulkSaveButton').click(function(e) {
		bulkUpdate(selectedProducts);
	});

	$('#selectAllButton').click(function(e) {
		e.preventDefault();
		$('#productTableBody tr').addClass('selected');
		selectedProducts = allProducts;
	});

	$('#selectNoneButton').click(function(e) {
		e.preventDefault();
		$('#productTableBody tr').removeClass('selected');
		selectedProducts = [];
	});

	$('#saveAdvancedOptions').click(function(e) {
		socket.emit('saveAdvancedOptions', selectedProducts, $('#canadianStore').is(':checked'));
	});

	$('#sendToQB').click(function(e) {
		console.log('emitting saveToQuickbooks');
		socket.emit('saveToQuickbooks');
	});

	$('#updateAll').click(function(e) {
		socket.emit('updateAllItems');
	});

	$('#getCategoriesButton').click(function(e) {
		socket.emit('getCategories');
	});

	$('#saveCategoriesButton').click(function(e) {
		socket.emit('saveCategories');
	});
});

function getItems() {
	console.log('getting items');
	var query = {
		categoryid: $('#category').val(),
		sku: $('#sku').val(),
		onsale: $('#onSaleCheckbox').is(':checked'),
		manufacturer: $('#manufacturer').val(),
		canadian: $('#canadianStore').is(':checked')
	};

	socket.emit('getItemsFull', query);
}

function buildProductTable(products) {
	$('#productTable').dataTable().fnDestroy();
	$('#productTableBody').empty();
	if (!Array.isArray(products)) {
		console.log('nope.');
		return;
	}
	products.forEach(function(product) {
		var row = $('<tr></tr>');
		var checkbox = $('<td class="text-center"><input type="checkbox" class="lg-box"></td>');
		var sku = $('<td></td>').text(product.SKUInfo.SKU);
		var name = $('<td></td>').text(product.SKUInfo.Name);
		var manufacturer = $('<td></td>').text(product.ManufacturerID);
		var price = $('<td></td>').text(product.SKUInfo.Price.toFixed(2));
		var stock = $('<td></td>').text(product.SKUInfo.Stock);

		row.append(checkbox);
		row.append(sku);
		row.append(name);
		row.append(manufacturer);
		row.append(price);
		row.append(stock);

		$('#productTableBody').append(row);

		row.click(function(e) {
			if (e.target.type == "checkbox") {
				if (e.target.checked) {
					selectedProducts.push(product);
				} else {
					selectedProducts.splice($.inArray(product, selectedProducts), 1);
				}
				row.toggleClass('selected');
			} else {
				console.log('open modal box');
			}
		});
	});

	$('#productTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[1, 'asc']]
	});
}

function bulkUpdate(products) {
	var bulkUpdates = {
		priceIncrease: $('#increasePrice').val()
	};

	socket.emit('updateItems', products, bulkUpdates);
}

function bulkSave(products) {
	var categoryToAdd = $('#addCategory').val();
	var categoryToRemove = $('#removeCategory').val();

	products.forEach(function(product) {
		product.CategoryList.push({
			CategoryID: categoryToAdd
		});
	});

	products.forEach(function(product) {
		var categories = product.CategoryList;
		var indexToRemove = -1;
		for (var i = 0; i < categories.length; i++) {
			if (categories[i].CategoryID == categoryToRemove) {
				indexToRemove = i;
				break;
			}
		}

		if (indexToRemove > -1) {
			product.CategoryList.splice(indexToRemove, 1);
		}
	});

	console.log(products);
	
	$.post('/api/3dcart/inventory', {'products': products})
		.done(function(result) {
			console.log(result);
		});
}