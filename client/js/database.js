var socket = io();

var usDistribution = 0.6;
var canDistribution = 0.4;
var theItem = {};

var queries = {
	$eq: [],
	$gt: [],
	$lt: []
};

function getQuery() {
	var query = {
		sku: $('#sku').val(),
		manufacturerName: $('#manufacturer').val(),
		catalogId: $('#catalogId').val(),
		updated: $('#updated').is(':checked'),
		isOption: $('#isOption').is(':checked'),
		hasOptions: $('#hasOptions').is(':checked'),
		catalogIdCan: $('#catalogIdCan').val()
	};

	if (query.sku == '') {
		delete query.sku;
	}
	if (query.manufacturerName == '') {
		delete query.manufacturerName;
	}
	if (query.catalogId == '') {
		delete query.catalogId;
	}
	if (query.catalogIdCan == '') {
		delete query.catalogIdCan;
	}
	if (query.updated == false) {
		delete query.updated;
	}
	if (query.isOption == false) {
		delete query.isOption
	}
	if (query.hasOptions == false) {
		delete query.hasOptions
	}

	return query;
}

$(document).ready(function() {
	$('#databaseTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[0, 'asc']]
	});

	socket.emit('getSettings');

	$('#advancedButton').click(function(e) {
		$(this).toggleClass('active');
	});

	$('#searchButton').click(function(e) {
		socket.emit('searchDB', getQuery());
	});

	// update stock automatically
	$('#stock').change(function() {
		var totalStock = $('#stock').val();
		$('#usStock').val((totalStock * usDistribution).toFixed());
		$('#canStock').val((totalStock * canDistribution).toFixed());
	});

	$('#andQuery').click(function(e) {
		// add the query to the and part
		var value = $('#valueInput').val();
		if (value == '') {
			return; // don't do anything
		}

		var operator = $('#operator').val();
		var field = $('#fieldSelect').val();

		console.log(field + ' ' + operator + ' ' + value);
	});

	$('#amazonButton').click(function(e) {
		socket.emit('sendProductsToAmazon');
	});

	$('#amazonVendorButton').click(function(e) {
		socket.emit('generateVendorFile', getQuery());
	});

	$('#facebookButton').click(function(e) {
		socket.emit('generateFacebookFeed');
	});

	$('#saveItemButton').click(function(e) {
			saveItem(theItem);
		});
});

socket.on('searchFinished', function(data) {
	console.log(data);
	$('#databaseTable').dataTable().fnDestroy();
	$('#databaseTableBody').empty();
	buildItemTable(data);
});

socket.on('getSettingsFinished', function(data) {
	usDistribution = data.usDistribution;
	canDistribution = data.canadianDistribution;
});

function buildItemTable(items) {
	items.forEach(function(item) {
		var row = $('<tr></tr>');
		var sku = $('<td></td>').text(item.sku+'');
		var name = $('<td></td>').text(item.name+'');
		if (item.usPrice)
			var usPrice = $('<td></td>').text('$'+item.usPrice.toFixed(2));
		var canadaPrice = '-';
		if (item.canPrice != undefined)
			canadaPrice = '$'+item.canPrice.toFixed(2);

		var canPrice = $('<td></td>').text(canadaPrice);
		var stock = $('<td></td>').text(item.stock+'');

		row.append(sku);
		row.append(name);
		row.append(usPrice);
		row.append(canPrice);
		row.append(stock);

		row.click(function(e) {
			theItem = item;
			$('#itemNameTitle').text(item.name);
			$('#itemSKU').val(item.sku);
			$('#itemName').val(item.name);
			$('#usPrice').val(item.usPrice.toFixed(2));
			if (item.canPrice != undefined)
				$('#canPrice').val(item.canPrice.toFixed(2));
			$('#stock').val(item.stock);
			$('#usStock').val(item.usStock);
			$('#canStock').val(item.canStock);
			$('#location').val(item.location);
			$('#barcode').val(item.barcode);
			$('#country').val(item.countryOfOrigin);
			$('#itemInactive').prop('checked', item.inactive === true);
			$('#itemIsOption').prop('checked', item.isOption === true);
			$('#itemHasOptions').prop('checked', item.hasOptions === true);
			$('#catalogIdUS').val(item.catalogId);
			console.log(item.catalogIdCan);
			$('#catalogIdCanModal').val(item.catalogIdCan);
			$('#optionId').val(item.optionId);
			$('#optionIdCan').val(item.optionIdCan);
			$('#itemModal').modal();
		});

		$('#databaseTableBody').append(row);
	});

	$('#databaseTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[0, 'asc']]
	});
}

function saveItem(item) {
	console.log(item);
	item.name = $('#itemName').val();
	item.usPrice = parseFloat($('#usPrice').val());
	item.canPrice = parseFloat($('#canPrice').val());
	item.stock = $('#stock').val();
	item.usStock = $('#usStock').val();
	item.canStock = $('#canStock').val();
	item.location = $('#location').val();
	item.barcode = $('#barcode').val();
	item.countryOfOrigin = $('#country').val();
	item.isOption = $('#itemIsOption').is(':checked');
	item.hasOptions = $('#itemHasOptions').is(':checked');
	item.inactive = $('#itemInactive').is(':checked');
	socket.emit('saveItem', item);
	$('#itemModal').modal('hide');
}