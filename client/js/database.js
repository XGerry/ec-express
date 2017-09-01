var socket = io();

$(document).ready(function() {
	$('#databaseTable').DataTable({
		bDestroy: true,
		pageLength: 100,
		order: [[0, 'asc']]
	});

	$('#searchButton').click(function(e) {
		var query = {
			sku: $('#sku').val(),
			catalogId: $('#catalogId').val(),
			updated: $('#updated').is(':checked'),
			isOption: $('#isOption').is(':checked'),
			hasOptions: $('#hasOptions').is(':checked')
		};
		socket.emit('searchDB', query);
	});
});