var socket = io.connect('http://localhost:3000');

function showLoading(buttonId, iconId, progressBarId) {
	if (buttonId) {
		$('#'+buttonId).addClass('disabled');
	}
	if (iconId) {
		$('#'+iconId).removeClass('fa-square-o');
		$('#'+iconId).addClass('fa-refresh fa-spin');
	}
	if (progressBarId) {
		$('#'+progressBarId).addClass('active');
	}
}

function doneLoading(buttonId, iconId, progressBarId) {
	if (buttonId) {
		$('#'+buttonId).removeClass('disabled');
	}
	if (iconId) {
		$('#'+iconId).removeClass('fa-spin');
		$('#'+iconId).addClass('fa-check-square-o');	
	}
	if (progressBarId) {
		$('#'+progressBarId).removeClass('active');
	}
}

$(document).ready(function() {
	$(".dropdown-toggle").dropdown();

	$('#getInventoryButton').click(function(e) {
		showLoading('getInventoryButton', 'quickStep1', 'getInventoryProgressBar');
		$.get('/api/sync/inventory').done(function(response) {
			console.log(response);
			$('#step1').text('Found ' + response.length + ' items in 3D Cart and created a query.');
			doneLoading('getInventoryButton', 'quickStep1', 'getInventoryProgressBar');
		});
	});

	$('#saveInventoryButton').click(function(e) {
		showLoading('saveInventoryButton', 'quickStep3', 'saveInventoryProgressBar');
		$('#step3').text('This will save both the items and their options. Depending on how many options need to be updated, this could take a while.');
		$.post('/api/sync/inventory').done(function(response) {
			console.log(response);
			doneLoading('saveInventoryButton', 'quickStep3', 'saveInventoryProgressBar');
		});
	});

	$('#getOptionsButton').click(function(e) {
		$.get({url:'/api/find/options', headers: {
			"Expect":"100-continue"
		}}).done(function(response) {
			console.log(response);
		});
	});

	$('#webConnectorCheckbox').click(function(e) {
		doneLoading(null, 'quickStep2');
	});

	$('#buildOptionItems').click(function(e) {
		var time = 1000 * 60 * 10;
		$.post({url: '/api/items/advancedoptions', timeout: time}).done(function(response) {
			console.log(response);
		});
	});

	$('#saveOptionsButton').click(function(e) {
		var time = 1000 * 60 * 10;
		$.post({url: '/api/sync/inventory/options', timeout: time}).done(function(response) {
			console.log(response);
		});
	});
});

socket.on('getItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 100;
	$('#getInventoryProgressBar').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('saveItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 50;
	$('#saveInventoryProgressBar').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('saveOptionItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 50;
	percentageComplete+= 50;
	$('#saveInventoryProgressBar').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});