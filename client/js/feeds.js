var socket = io();

$(document).ready(function() {
	$('#createWalmartItem').click(function() {
		var sku = $('#sku').val();
		socket.emit('createWalmartItem', sku);
	});

	$('#getWalmartFeed').click(function() {
		var feedId = $('#feedId').val();
		socket.emit('getWalmartFeed', feedId);
	});

	$('#getWalmartInventory').click(function() {
		var sku = $('#sku').val();
		socket.emit('getWalmartInventory', sku);
	});

	$('#getWalmartItem').click(function() {
		var sku = $('#sku').val();
		socket.emit('getWalmartItem', sku);
	});

	$('#updateWalmartItem').click(function() {
		var sku = $('#sku').val();
		socket.emit('updateWalmartItem', sku);
	});

	$('#updateWalmartInventory').click(function() {
		var sku = $('#sku').val();
		socket.emit('updateWalmartInventory', sku);
	});

	$('#amazonButton').click(function() {
		var sku = $('#sku').val();
		socket.emit('createAmazonItem', sku);
	});

	$('#addAmazonImage').click(function() {
		var sku = $('#sku').val(); 
		socket.emit('addAmazonImage', sku);
	});

	$('#updateAmazonInventory').click(function() {
		var sku = $('#sku').val();
		socket.emit('updateAmazonInventory', sku);
	});

	$('#updateAmazonPricing').click(function() {
		var sku = $('#sku').val();
		socket.emit('updateAmazonPricing', sku);
	});
});