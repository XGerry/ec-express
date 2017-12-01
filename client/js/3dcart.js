var socket = io();

var selectedProducts = [];
var allProducts = [];
var items = [];

socket.on('saveAdvancedOptionsFinished', function(data) {
	console.log('finshed saving options');
	console.log(data);
});

socket.on('updateItemsFinished', function(data) {
	console.log(data);
});

socket.on('getItemsFinished', function() {
	console.log(items);
	buildProductTable(items);
	$('#getProductsProgress').removeClass('active');
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

socket.on('getItemsProgress', function(progress, total, itemsChunk) {
	items = items.concat(itemsChunk);
	var percentage = (progress / total) * 100;
	$('#getProductsProgress').css("width", percentage + '%');
	$('#getProductsProgress').text(percentage.toFixed(0) + '%');
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
		allProducts = [];
		items = [];
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

	var priceFrom = $('#priceFrom').val();
	if (priceFrom != '') {
		query.pricefrom = priceFrom;
	}

	var priceTo = $('#priceTo').val();
	if (priceTo != '') {
		query.priceTo = priceTo;
	}

	var stockfrom = $('#stockfrom').val();
	var stockto = $('#stockto').val();
	if (stockfrom != '') {
		query.stockfrom = stockfrom;
	}
	if (stockto != '') {
		query.stockto = stockto;
	}

	var lastupdatestart = $('#lastupdatefrom').val();
	var lastupdateend = $('#lastupdateto').val();

	if (lastupdatestart != '') {
		var date = new Date(lastupdatestart);
		query.lastupdatestart = date.getMonth() + '/' + date.getDate() + '/' + date.getFullYear();
	}

	if (lastupdateend != '') {
		var date = new Date(lastupdateend);
		query.lastupdateend = date.getMonth() + '/' + date.getDate() + '/' + date.getFullYear();
	}


	$('#getItemsProgress').css('width', '0%');
	$('#getItemsProgress').addClass('active');

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
		priceIncrease: $('#increasePrice').val(),
		categoryToAdd: $('#addCategory').val(),
		categoryToRemove: $('#removeCategory').val(),
		addKeyword: $('#keywords').val()
		//onSale: $('#onSaleCheckbox').is(':checked')
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