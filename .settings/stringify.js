#!/usr/bin/env node

// pass in a filename.json and get back a string version for meteor settings

fs = require('fs');
path = require('path');

if (process.argv.length < 3) {
  console.error('Error: No filename passed. node stringify.js filename.json');
}

var filename = process.argv[2];

fs.readFile(path.resolve(__dirname, filename), 'utf8', function(error, data) {
  if (error) {
    return console.error(error);
  } else {
    data = data.replace(/(\r\n|\n|\r)/gm,"");
    console.log('');
    console.log(JSON.stringify(data));
    console.log('');
  }
});
