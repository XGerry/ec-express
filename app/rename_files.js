var fs = require('fs');
var folder = 'C:\\Users\\matto\\Downloads\\Tattered Angels';
var usedNames = [];
var alphabet = 'abcdefghijklmnopqrstuvwxyz';
var upperCaseAlphabet = alphabet.toUpperCase();
var fileExtensionPattern = /\.([0-9a-z]+)(?=[?#])|(\.)(?:[\w]+)$/gmi

fs.readdir(folder, (err, data) => {
	data.forEach((fileName) => {
		var letterIndex = 0;
		var extension = fileName.match(fileExtensionPattern)[0];
		var tempName = fileName.replace('_', ' ');
		var words = tempName.split(' ');
		tempName = words[3];
		var newName = tempName;
		for (var i = 0; i < usedNames.length; i++) {
			if (newName == usedNames[i]) {
				newName = tempName + upperCaseAlphabet[letterIndex];
				i = 0;
				letterIndex++;
			}
		}
		usedNames.push(newName);
		newName += extension;

		fs.rename(folder+'\\'+fileName, folder+'\\'+newName, (err) => {
			if (err) throw err;
				console.log('Renamed ' + fileName + ' to ' + newName);
		});
	});
});

