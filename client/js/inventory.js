var socket = io();

function showLoading(buttonId, iconId, progressBarId) {
	if (buttonId) {
		$('#'+buttonId).addClass('disabled');
	}
	if (iconId) {
		showLoadingIcon(iconId);
	}
	if (progressBarId) {
		$('#'+progressBarId).addClass('active');
	}
}

function showLoadingIcon(iconId) {
	$('#'+iconId).removeClass('fa-square');
	$('#'+iconId).removeClass('fa-check-square');	
	$('#'+iconId).addClass('fa-sync fa-spin');
}

function doneLoadingIcon(iconId) {
	$('#'+iconId).removeClass('fa-spin');
	$('#'+iconId).addClass('fa-check-square');
}

function doneLoadingProgress(barClass) {
	$('.'+barClass).css('width', '100%').text('Done');
	$('.'+barClass).removeClass('active');
	$('.'+barClass).removeClass('progress-bar-striped');
}

function doneLoading(buttonId, iconId, progressBarId) {
	if (buttonId) {
		$('#'+buttonId).removeClass('disabled');
	}
	if (iconId) {
		$('#'+iconId).removeClass('fa-spin');
		$('#'+iconId).addClass('fa-check-square');	
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

	$('#syncInventoryAndOrders').click(e => {
		$('#syncInventoryAndOrders').button('loading');
		$('#getOrdersProgress').addClass('active');
		socket.emit('syncInventoryAndOrders');
		showLoadingIcon('quickGetOrders');
	});

	$('#saveInventory').click(e => {
		showLoadingIcon('quickSaveItems');
		socket.emit('saveItems');
	});
});

socket.on('getOrdersFinished', numOfOrders => {
	$('#orderInfo').text('Received ' + numOfOrders + ' orders from 3D Cart');
	doneLoadingIcon('quickGetOrders');
	$('#getOrdersProgress').css('width', '100%').text('Done');
	$('#getOrdersProgress').removeClass('active');
	$('#getOrdersProgress').removeClass('progress-bar-striped');

	// now step 2
	showLoadingIcon('quickGetItems')
	$('.refreshInventoryProgress').addClass('active');
});

socket.on('getSettingsFinished', function(data) {
	$('#usStore').val(data.usDistribution * 100);
	$('#canStore').val(data.canadianDistribution * 100);
});

socket.on('getItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 100;
	$('.refreshInventoryProgress').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('saveItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 100;
	$('.saveInventoryProgress').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('saveOptionItemsProgress', function(data) {
	var percentageComplete = (data.progress / data.total) * 100;
	$('.saveOptionsProgress').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('getItemsFinished', function() {
	//doneLoading('getInventoryButton', 'quickStep1', 'getInventoryProgressBar');
	doneLoadingIcon('quickGetItems');
	$('.refreshInventoryProgress').removeClass('active');
	$('.refreshInventoryProgress').removeClass('progress-bar-striped');
	alert('Please run the Quickbooks Web Connector to continue.');
});

socket.on('saveItemsFinished', function(data) {
	doneLoadingIcon('quickSaveItems');
	doneLoadingProgress('saveInventoryProgress');
	showLoadingIcon('quickSaveOptions');
	$('.saveOptionsProgress').addClass('active');
});

socket.on('saveOptionItemsFinished', function(data) {
	//doneLoading('saveInventoryButton', 'quickStep3', 'saveInventoryProgressBar');
	console.log('done the option items');
	doneLoadingIcon('quickSaveOptions');
	doneLoadingProgress('saveOptionsProgress');
	showLoadingIcon('quickRecalculate');
	$('.baseStockProgress').addClass('active');
});

socket.on('webConnectorStarted', () => {
	showLoadingIcon('quickRunConnector');
});

socket.on('webConnectorFinished', () => {
	doneLoadingIcon('quickRunConnector');
	doneLoadingProgress('connectorBar');
	showLoadingIcon('quickSaveItems');
});

socket.on('calculateBaseStockProgress', data => {
	var percentageComplete = (data.progress / data.total) * 100;
	$('.baseStockProgress').css("width", percentageComplete + '%').text(percentageComplete.toFixed(0) + '%');
});

socket.on('calculateBaseStockFinished', () => {
	doneLoadingIcon('quickRecalculate');
	doneLoadingProgress('baseStockProgress');
	$('#syncInventoryAndOrders').button('reset');
});