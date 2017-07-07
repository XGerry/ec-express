var selectedProducts = [];
var allProducts = [];

$(document).ready(function() {
	$(".dropdown-toggle").dropdown();
	$('#getProductsButton').click(function(e) {
		$.get('/api/3dcart/inventory', $('#productForm').serialize()).done(function(result) {
			console.log(result);
			buildProductTable(result);
			selectedProducts = [];
			allProducts = result;
		});
	});

	$('#bulkSaveButton').click(function(e) {
		bulkSave(selectedProducts);
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
});

function buildProductTable(products) {
	$('#productTableBody').empty();
	products.forEach(function(product) {
		var row = $('<tr></tr>');
		var sku = $('<td></td>').text(product.SKUInfo.SKU);
		var name = $('<td></td>').text(product.SKUInfo.Name);
		var manufacturer = $('<td></td>').text(product.ManufacturerID);
		var price = $('<td></td>').text(product.SKUInfo.Price);
		var stock = $('<td></td>').text(product.SKUInfo.Stock);

		row.append(sku);
		row.append(name);
		row.append(manufacturer);
		row.append(price);
		row.append(stock);

		$('#productTableBody').append(row);

		row.click(function(e) {
			if (row.hasClass('selected')) {
				// remove from list
				selectedProducts.splice($.inArray(product, selectedProducts), 1);
			} else {
				selectedProducts.push(product);
			}
			row.toggleClass('selected');
		});
	});

	$('#productTable').DataTable({
		pageLength: 100,
		order: [[0, 'asc']]
	});
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