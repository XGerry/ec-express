var socket = io();

function showLoading(buttonId, iconId, progressBarId) {
	if (buttonId) {
		$('#'+buttonId).addClass('disabled');
	}
	if (iconId) {
		$('#'+iconId).removeClass('fa-square-o');
		$('#'+iconId).removeClass('fa-check-square-o');	
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
		$('#'+progressBarId).removeClass('progress-bar-striped');
	}
}

$(document).ready(function() {
	$(".dropdown-toggle").dropdown();

	$('#getInventoryButton').click(function(e) {
		showLoading('getInventoryButton', 'quickStep1', 'getInventoryProgressBar');
		socket.emit('getItems');
	});

	$('#getItemsAdvancedButton').click(function(e) {
		showLoading('getInventoryAdvancedButton', 'quickStep1', 'getInventoryProgressBar');
		socket.emit('getItems');
	});

	$('#saveInventoryButton').click(function(e) {
		showLoading('saveInventoryButton', 'quickStep3', 'saveInventoryProgressBar');
		$('#step3').text('This will save both the items and their options. Depending on how many options need to be updated, this could take a while.');
		socket.emit('saveItems');
	});

	$('#generateQBXMLButton').click(function(e) {
		$.get('/api/sync/inventory/qbxml').done(function(response) {
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

	$('#webConnectorCheckbox').click(function(e) {
		doneLoading(null, 'quickStep2');
	});

	$('#buildOptionItems').click(function(e) {
		var time = 1000 * 60 * 10;
		$.post({url: '/api/items/advancedoptions', timeout: time}).done(function(response) {
			console.log(response);
		});
	});

	$('#saveOptionsOverride').click(function(e) {
		socket.emit('saveOptionsOverride');
	});

	$('#saveSettingsButton').click(function(e) {
		var data = {
			us: $('#usStore').val(),
			canada: $('#canStore').val()
		};
		socket.emit('saveSettings', data)
	});

	$('#refreshAllItems').click(function(e) {
		socket.emit('refreshAllItems');
	});

	$('#calculateBaseItemStock').click(e => {
		console.log('calculating stock');
		socket.emit('calculateBaseItemStock');
	});

	socket.emit('getSettings');
});

socket.on('getSettingsFinished', function(data) {
	$('#usStore').val(data.usDistribution * 100);
	$('#canStore').val(data.canadianDistribution * 100);
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

socket.on('getItemsFinished', function() {
	doneLoading('getInventoryButton', 'quickStep1', 'getInventoryProgressBar');
});

socket.on('saveItemsFinished', function(data) {
	console.log('Finished saving the items');
});

socket.on('saveOptionItemsFinished', function(data) {
	doneLoading('saveInventoryButton', 'quickStep3', 'saveInventoryProgressBar');
});