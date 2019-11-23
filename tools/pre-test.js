// @flow

const fs = require("fs");
const generateJSONSchema = require("./lib/generateJSONSchema");

const jsonSchema = generateJSONSchema("test");
fs.writeFileSync(
	"build/files/league-schema.json",
	JSON.stringify(jsonSchema, null, 2),
);
