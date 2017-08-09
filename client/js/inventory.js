$(document).ready(function() {
	$(".dropdown-toggle").dropdown();

	$('#getInventoryButton').click(function(e) {
		$.get('/api/sync/inventory').done(function(response) {
			console.log(response);
			console.log('Run Web Connector');
		});	
	});

	$('#saveInventoryButton').click(function(e) {
		$.post('/api/sync/inventory').done(function(response) {
			console.log(response);
		});
	});

	$('#getOptionsButton').click(function(e) {
		$.get({url:'/api/find/options', headers: {
			"Expect":"100-continue"
		}}).done(function(response) {
			console.log(response);
		});
	});

	$('#buildOptionItems').click(function(e) {
		$.get({url: '/api/items/advancedoptions', headers: {
			"Expect":"100-continue"
		}}).done(function(response) {
			console.log(response);
		});
	});

	$('#saveOptionsButton').click(function(e) {
		$.post('/api/sync/inventory/options').done(function(response) {
			console.log(response);
		});
	});
});