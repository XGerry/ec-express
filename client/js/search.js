(function($) {
	$.fn.searchBar = function(searchFunction) {
		this.on('keyup', _.debounce(searchFunction, 400));
		return this;
	}
}(jQuery));

let SearchBar = function(id) {
	this.id = id;
	this.$bar = $('#'+id);
}

SearchBar.prototype.getSearchTerms = function() {
	return this.$bar.val();
}

SearchBar.prototype.run = function(callback) {
	if (this.generateURL == null) {
		throw new Error('You must implement a generateURL function');
	}
	let searchBar = this;
	this.$bar.searchBar(function() {
		if (searchBar.generateURL() == '') return;
		axios.get(searchBar.generateURL()).then(response => {
			callback(response.data);
			$('#searchResults').fadeIn(100);
		});
	});
}