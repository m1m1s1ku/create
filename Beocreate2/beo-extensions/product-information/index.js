/*Copyright 2018 Bang & Olufsen A/S
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

// BEOCREATE PRODUCT INFORMATION

import express from 'express';
import piSystem from '../../beocreate_essentials/pi_system_tools';
import beoCom from '../../beocreate_essentials/communication';
import fs from 'fs';

import { version } from './package.json';

var extensions = beo.extensions;
var setup = beo.setup;
var download = beo.download;
var debug = beo.debug;

var speakerPresetDirectory = beo.dataDirectory+"/beo-speaker-presets"; // Sound presets directory.
var systemSpeakerPresetDirectory = beo.systemDirectory+"/beo-speaker-presets"; // Sound presets directory.
var productIdentityDirectory = beo.dataDirectory+"/beo-product-identities"; // Product identities directory.
var systemProductIdentityDirectory = beo.systemDirectory+"/beo-product-identities"; // Product identities directory.


var hasInternet = false;

var systemType = (beo.systemConfiguration.cardType && beo.systemConfiguration.cardType.indexOf("Beocreate") == -1) ? "hifiberry" : "beocreate";

var systemID = null;
var systemName = {ui: null, static: null};
var systemVersion = null;
var hifiberryVersion = null;
var systemNameSent = false;

var defaultSettings = {
	"modelID": "beocreate-4ca-mk1", 
	"modelName": "BeoCreate 4-Channel Amplifier",
	"productImage": "/product-images/beocreate-4ca-mk1.png",
	"bonjourEnabled": true,
	"systemNameApprovedByUser": false
};

var genericProductImage = "";
if (systemType == "beocreate") {
	genericProductImage = "/common/beocreate-generic.png";
} else {
	genericProductImage = "/common/hifiberry-generic.png";
}

if (beo.customisations) {
	if (beo.customisations.productInformation) {
		// Default settings from customisations.
		if (beo.customisations.productInformation.defaultModelID) defaultSettings.modelID = beo.customisations.productInformation.defaultModelID;
		if (beo.customisations.productInformation.defaultModelName) defaultSettings.modelName = beo.customisations.productInformation.defaultModelName;
		if (beo.customisations.productInformation.defaultProductImage) defaultSettings.productImage = beo.customisations.productInformation.defaultProductImage;
		if (beo.customisations.productInformation.genericProductImage) genericProductImage = beo.customisations.productInformation.genericProductImage;
	}
	if (beo.customisations.systemClass) systemType = beo.customisations.systemClass;
}

if (systemType == "hifiberry") {
	defaultSettings.modelID = "hifiberry"; 
	defaultSettings.modelName = "HiFiBerry";
	defaultSettings.productImage = false;
}

var settings = JSON.parse(JSON.stringify(defaultSettings));

var currentProductImage = (!settings.productImage) ? genericProductImage : settings.productImage;

var productIdentities = {};
var allProductImages = {};
var linkedProductImages = [];

var imageDirectory = beo.dataDirectory+"/beo-product-images/";
var systemImageDirectory = beo.systemDirectory+"/beo-product-images/";

if (!fs.existsSync(imageDirectory)) fs.mkdirSync(imageDirectory);
if (!fs.existsSync(productIdentityDirectory)) fs.mkdirSync(productIdentityDirectory);

beo.expressServer.use("/product-images", express.static(systemImageDirectory, {etag: !(beo.developerMode)})); // Prefer product images from system directory.
beo.expressServer.use("/product-images", express.static(imageDirectory, {etag: !(beo.developerMode)})); // For user product images.

listAllProductImages();

beo.bus.on('general', function(event) {
	
	if (event.header == "startup") {
		systemVersion = event.content.systemVersion;
		systemVersionReadable = event.content.systemVersionReadable;
		
		if (fs.existsSync("/etc/hifiberry.version")) {
			hifiberryVersion = fs.readFileSync("/etc/hifiberry.version", "utf8").trim();
		}
		
		updateProductIdentities();
		
		piSystem.getSerial(function(serial) {
			if (serial != null) {
				systemID = serial;
			} else {
				systemID = null;
			}
		
			piSystem.getHostname(function(response, err) {
				// Wait for the system name before starting services.
				
				if (!err) systemName = response;
				if (!systemName.ui || 
					(systemName.ui == "HiFiBerry" && systemType != "hifiberry" && !settings.systemNameApprovedByUser)) {
					// If the UI name is not defined, assume this is a first-run scenario and give the system a default name. Alternatively, if this is a Beocreate system, it's called "HiFiBerry" but this name has not been user-approved, rename to Beocreate and ask for a new name during setup.
					if (!systemID) systemID = "new";
					if (systemType == "beocreate") {
						newName = "Beocreate";
					} else {
						newName = "HiFiBerry";
					}
					if (beo.customisations && 
						beo.customisations.productInformation && 
						beo.customisations.productInformation.defaultSystemName) {
						newName = beo.customisations.productInformation.defaultSystemName;
					}
					piSystem.setHostname(newName, function(success, response) {
						if (extensions["setup"] && extensions["setup"].joinSetupFlow) {
							extensions["setup"].joinSetupFlow("product-information", {after: ["choose-country", "network", "speaker-preset"], allowAdvancing: true});
						}
						if (success == true) { 
							systemName = response;
							if (debug) console.log("System name is now '"+systemName.ui+"' ("+systemName.static+").");
							if (!systemNameSent) {
								beo.bus.emit("ui", {target: "product-information", header: "showSystemName", content: {systemName: systemName.ui, systemVersion: systemVersion, staticName: systemName.static}});
								systemNameSent = true;
							}
							beo.bus.emit('product-information', {header: "systemNameChanged", content: {systemName: systemName.ui, staticName: systemName.static}});
							beo.bus.emit('product-information', {header: "productIdentity", content: {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: currentProductImage, systemID: systemID}});
							startOrUpdateBonjour();
						} else {
							if (debug) console.error("Setting system name failed: "+response);
						}
					});
				} else {
					if ((systemName.ui == "HiFiBerry" || systemName.ui == "Beocreate") &&
						!settings.systemNameApprovedByUser &&
						extensions["setup"] && 
						extensions["setup"].joinSetupFlow) {
						extensions["setup"].joinSetupFlow("product-information", {after: ["choose-country", "network", "sound-preset"], allowAdvancing: true});
					}
					if (!systemNameSent) {
						beo.bus.emit("ui", {target: "product-information", header: "showSystemName", content: {systemName: systemName.ui, systemVersion: systemVersion, staticName: systemName.static}});
						systemNameSent = true;
					}
					beo.bus.emit('product-information', {header: "productIdentity", content: {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: currentProductImage, systemID: systemID}});
					startOrUpdateBonjour();
					
				}
			});
		});
		
	}
	
	if (event.header == "activatedExtension") {
		if (event.content.extension == "product-information") {
			beo.bus.emit("ui", {target: "product-information", header: "showProductIdentity", content: {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: currentProductImage}});
		}
	}
	
	if (event.header == "shutdown") {
		if (beoCom.isBonjourStarted()) {
			beoCom.stopBonjour(function() {
				beo.bus.emit("general", {header: "shutdownComplete", content: {extension: "product-information"}});
			});
		}
	}
});


beo.bus.on('product-information', function(event) {
	
	if (event.header == "settings") {
		
		if (event.content.settings) {
			settings = Object.assign(settings, event.content.settings);
			currentProductImage = getProductImage(settings.productImage, true)[1];
		}
		
	}
	
	if (event.header == "setSystemName") {
		if (event.content.newSystemName) {
			if (debug) console.log("Setting system name...");
			piSystem.setHostname(event.content.newSystemName, function(success, response) {
				if (success == true) { 
					systemName = response;
					settings.systemNameApprovedByUser = true;
					beo.saveSettings("product-information", settings);
					if (debug) console.log("System name is now '"+systemName.ui+"' ("+systemName.static+").");
					beo.bus.emit('product-information', {header: "systemNameChanged", content: {systemName: systemName.ui, staticName: systemName.static}});
					startOrUpdateBonjour("systemName");
					beo.sendToUI("product-information", "showSystemName", {systemName: systemName.ui, staticName: systemName.static});
				} else {
					if (debug) console.error("Setting system name failed: "+response);
				}
			});
		}
	}
	
	if (event.header == "getBasicProductInformation") {
		if (systemName.ui) {
			beo.sendToUI("product-information", "basicProductInformation",{systemName: systemName.ui, staticName: systemName.static, systemVersion: systemVersion, hifiberryVersion: hifiberryVersion, systemID: systemID, systemType: systemType, systemConfiguration: beo.systemConfiguration});
			systemNameSent = true;
		}
	}
	
	if (event.header == "setProductModel") {
		if (event.content.modelID) {
			setProductModel(event.content.modelID);
		}
	}
	
	if (event.header == "addProductIdentities") {
		if (event.content.identities) {
			newIdentities = [];
			for (var i = 0; i < event.content.identities.length; i++) {
				if (!productIdentities[event.content.identities[i].modelID]) {
					productIdentities[event.content.identities[i].modelID] = {modelName: event.content.identities[i].modelName, productImage: event.content.identities[i].productImage};
					newIdentities.push(event.content.identities[i].modelName);
				}
			}
			if (debug && newIdentities.length > 0) console.log("Added product identities: "+newIdentities.join(", ")+".");
		}
	}
	
	if (event.header == "getProductIdentities") {
		beo.bus.emit("ui", {target: "product-information", header: "allProductIdentities", content: {identities: productIdentities}});
	}
	
	if (event.header == "restartProduct") {
		if (debug) console.error("User-requested product reboot...");
		beo.bus.emit("general", {header: "requestReboot", content: {extension: "product-information"}});
		
	}
	
	if (event.header == "shutdownProduct") {
		if (debug) console.error("User-requested product shutdown...");
		beo.bus.emit("general", {header: "requestShutdown", content: {extension: "product-information"}});
		
	}
	
	
	
});

beo.bus.on('setup', function(event) {

	if (event.header == "advancing" && event.content.fromExtension == "product-information") {
		settings.systemNameApprovedByUser = true;
		beo.saveSettings("product-information", settings);
	}
			
});

beo.bus.on('network', function(event) {
	
	if (event.header == "internetStatus") {
		if (event.content == true) {
			hasInternet = true;
			if (downloadQueue.length > 0) downloadProductImage(downloadQueue);
		} else {
			hasInternet = false;
		}
	}
	
	if (event.header == "newIPAddresses") {
		//if (event.content == true) {
			if (!bonjourStartedRecently && settings.bonjourEnabled) {
				if (debug) console.log("New IP addresses, restarting Bonjour advertisement...");
				clearTimeout(bonjourRestartDelay);
				bonjourRestartDelay = setTimeout(function() {
					beoCom.restartBonjour(); 
				}, 2000);
			}
		//}
	}
});

var bonjourStartedRecently = true;
var bonjourRestartDelay = null;

function startOrUpdateBonjour(newData) {
	if (settings.bonjourEnabled) {
		systemStatus = (!beo.setup) ? "normal" : "yellow";
		if (!beoCom.isBonjourStarted()) {
			// Bonjour is currently not advertising, start.
			if (debug) console.log("Advertising system as '"+systemName.ui+"'...");
			beoCom.startBonjour({name: systemName.ui, serviceType: "beocreate", advertisePort: beo.systemConfiguration.port, txtRecord: {"type": settings.modelID, "typeui": settings.modelName, "id": systemID, "image": currentProductImage, "status": systemStatus}});
			beo.bus.emit("general", {header: "requestShutdownTime", content: {extension: "product-information"}});
			setTimeout(function() {
				bonjourStartedRecently = false;
			}, 2000);
		} else {
			// Bonjour is already advertising, see what needs to be done.
			if (newData == "status" || newData == "model") {
				// If new data is system status or model change, only update TXT record.
				if (debug) console.log("Updating TXT record of Bonjour advertisement...");
				beoCom.updateTxtRecord({"type": settings.modelID, "typeui": settings.modelName, "id": systemID, "image": currentProductImage, "status": systemStatus});
			} else {
				// For anything else, stop and restart advertisement.
				beoCom.stopBonjour(function() {
					startOrUpdateBonjour(); // Run this again, easy.
				});
			}
		}
	}
}


function getProductInformation() {
	return {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: settings.productImage, systemID: systemID};
}



function setProductModel(modelID) {
	if (productIdentities[modelID]) {
		settings.modelID = modelID;
		settings.modelName = productIdentities[modelID].modelName;
		settings.productImage = productIdentities[modelID].productImage[0];
		currentProductImage = productIdentities[modelID].productImage[1];
		if (debug) console.log("Product model name is now '"+settings.modelName+"'.");
		beo.bus.emit("settings", {header: "saveSettings", content: {extension: "product-information", settings: settings}});
		beo.bus.emit('product-information', {header: "productIdentity", content: {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: currentProductImage, systemID: systemID}});
		startOrUpdateBonjour("model");
		beo.bus.emit("ui", {target: "product-information", header: "showProductModel", content: {modelID: settings.modelID, modelName: settings.modelName, productImage: currentProductImage}});
	}
}


function updateProductIdentities() {
	// Combines product identities from beo-product-identities and beo-speaker-presets directories, from system and user locations.
	linkedProductImages = [];
	
	if (fs.existsSync(systemSpeakerPresetDirectory)) {
		presetFiles = fs.readdirSync(systemSpeakerPresetDirectory);
		for (var i = 0; i < presetFiles.length; i++) {
			try {
				preset = JSON.parse(fs.readFileSync(systemSpeakerPresetDirectory+"/"+presetFiles[i], "utf8"));
				if (preset["product-information"]) {
					checkAndAddProductIdentity(preset["product-information"]);
				} else {
					if (debug == 2) console.log("No product identity data in speaker preset '"+presetFiles[i]+"'.");
				}
			} catch (error) {
				console.error("Invalid JSON data for speaker preset '"+presetFiles[i]+"':", error);
			}
		}
	}
	if (fs.existsSync(speakerPresetDirectory)) {
		presetFiles = fs.readdirSync(speakerPresetDirectory);
		for (var i = 0; i < presetFiles.length; i++) {
			try {
				preset = JSON.parse(fs.readFileSync(speakerPresetDirectory+"/"+presetFiles[i], "utf8"));
				if (preset["product-information"]) {
					checkAndAddProductIdentity(preset["product-information"]);
				} else {
					if (debug == 2) console.log("No product identity data in speaker preset '"+presetFiles[i]+"'.");
				}
			} catch (error) {
				console.error("Invalid JSON data for speaker preset '"+presetFiles[i]+"':", error);
			}
		}
	}
	
	
	if (fs.existsSync(systemProductIdentityDirectory)) {
		identityFiles = fs.readdirSync(systemProductIdentityDirectory);
		for (var i = 0; i < identityFiles.length; i++) {
			try {
				checkAndAddProductIdentity(JSON.parse(fs.readFileSync(systemProductIdentityDirectory+"/"+identityFiles[i], "utf8")), true);
			} catch (error) {
				console.error("Invalid JSON data for product identity '"+identityFiles[i]+"':", error);
			}
		}
	}

	if (fs.existsSync(productIdentityDirectory)) {
		identityFiles = fs.readdirSync(productIdentityDirectory);
		for (var i = 0; i < identityFiles.length; i++) {
			try {
				checkAndAddProductIdentity(JSON.parse(fs.readFileSync(productIdentityDirectory+"/"+identityFiles[i], "utf8")), true, identityFiles[i]);
			} catch (error) {
				console.error("Invalid JSON data for product identity '"+identityFiles[i]+"':", error);
			}
		}
	}
	
	for (image in allProductImages) {
		// Create generic product identities for any unused product images.
		imageName = image.substring(image.lastIndexOf('/') + 1);
		if (linkedProductImages.indexOf(imageName) == -1) {
			fauxModelID = image.slice(0, image.indexOf(".png"));
			if (beo.customisations && beo.customisations.brand) {
				fauxModelName = beo.customisations.brand;
			} else {
				fauxModelName = (systemType == "beocreate") ? "Beocreate" : "HiFiBerry";
			}
			if (debug) console.log("Adding faux product identity: "+fauxModelID+".");
			fauxIdentity = {
				modelID: fauxModelID,
				productImage: image,
				modelName: fauxModelName
			};
			checkAndAddProductIdentity(fauxIdentity, true);
		}
	}
	//beo.bus.emit('product-information', {header: "identitiesReady"});
}


function checkAndAddProductIdentity(data, internal, fileReference) {
	
	if (data.modelID != undefined) {
		identity = {previewProcessor: "product_information.generateSettingsPreview"};
		
		identity.modelID = data.modelID; // Model ID is required.
	
		if (data.modelName != undefined) {
			identity.modelName = data.modelName;
		}
		
		if (data.designer != undefined) {
			identity.designer = data.designer;
		}
		
		if (data.manufacturer != undefined) {
			identity.manufacturer = data.manufacturer;
		}
		
		if (data.productImage != undefined) {
			identity.productImage = getProductImage(data.productImage);
			if (identity.productImage[2]) {
				if (linkedProductImages.indexOf(identity.productImage[2]) == -1) linkedProductImages.push(identity.productImage[2]);
			}
		} else {
			identity.productImage = getProductImage(false);
		}
		
		identity.internal = (internal) ? true : false;
		
		identity.fileReference = (fileReference) ? fileReference : null;
		
		if (data.produced != undefined) {
			if (!isNaN(data.produced)) {
				identity.produced = data.produced;
			} else if (Array.isArray(data.produced)) {
				if (!isNaN(data.produced[0]) && !isNaN(data.produced[1])) {
					identity.produced = data.produced;
				}
			}
		}
		
		productIdentities[identity.modelID] = identity;
	}
}

function deleteProductIdentity(identity, internal) {
	if (productIdentities[identity]) {
		if (!productIdentities[identity].internal || internal) {
			// Only delete "internal" presets with an override.
			if (internal && productIdentities[identity].fileReference) {
				// Delete the identity file if it is referenced.
				if (fs.existsSync(productIdentityDirectory+"/"+productIdentities[identity].fileReference)) {
					fs.unlinkSync(productIdentityDirectory+"/"+productIdentities[identity].fileReference);
				}
			}
			if (debug) console.log("Removing product identity '"+identity+"'.");
			delete productIdentities[identity];
		}
	}
}

function getProductIdentity(identityID = settings.modelID, clean = false) {
	
	if (productIdentities[identityID]) {
		identityToSend = productIdentities[identityID];
		if (clean) {
			identityToSend = JSON.parse(JSON.stringify(identityToSend));
			delete identityToSend.previewProcessor;
			delete identityToSend.internal;
			delete identityToSend.fileReference;
			if (!identityToSend.productImage[0]) {
				delete identityToSend.productImage;
			} else if (identityToSend.productImage[2]) {
				identityToSend.productImage = identityToSend.productImage[2];
			}
		}
		return identityToSend;
	} else {
		return null;
	}
}


function listAllProductImages() {
	allProductImages = {};
	
	if (fs.existsSync(systemImageDirectory)) {
		imageFiles = fs.readdirSync(systemImageDirectory);
		for (var i = 0; i < imageFiles.length; i++) {
			allProductImages[imageFiles[i]] = systemImageDirectory+imageFiles[i];
		}
	}
	if (fs.existsSync(imageDirectory)) {
		imageFiles = fs.readdirSync(imageDirectory);
		for (var i = 0; i < imageFiles.length; i++) {
			if (!allProductImages[imageFiles[i]]) {
				allProductImages[imageFiles[i]] = systemImageDirectory+imageFiles[i];
			}
		}
	}
}

function getProductImage(reference, noDownload) {
	url = null;
	imageName = undefined;
	if (reference && reference.indexOf("/") != -1) {
		imageName = reference.substring(reference.lastIndexOf('/') + 1);
		if (reference.indexOf("http") != -1) url = reference;
	} else if (reference != undefined) {
		imageName = reference;
	}
	if (imageName == "beocreate-generic.png") {
		return ["/common/beocreate-generic.png", "/common/beocreate-generic.png"];
	} else if (imageName == "hifiberry-generic.png") {
		return ["/common/hifiberry-generic.png", "/common/hifiberry-generic.png"];
	} else if (imageName) {
		if (imageName.indexOf(".png") == -1) imageName += ".png";
		if (allProductImages[imageName]) {
			image = imageName;
			return ["/product-images/"+imageName, "/product-images/"+imageName, imageName];
		}  else {
			if (url && !noDownload) {
				downloadProductImage(url);
				return ["/product-images/"+imageName, "/product-images/"+imageName, imageName];
			} else {
				return [false, genericProductImage];
			}
		}
	} else {
		return [false, genericProductImage];
	}
	
}

downloadQueue = [];
function downloadProductImage(queue, callback, downloaded, failed) {
	if (hasInternet) {
		fromURL = null;
		if (queue != false && queue != null) {
			if (typeof queue == "string") {
				fromURL = queue;
				queue = false;
			} else {
				if (Array.isArray(queue)) {
					// The queue is a queue, take the first item.
					fromURL = queue.shift();
					if (queue.length == 0) queue = false;
				} else {
					// The "queue" is an object (a single entry).
					fromURL = queue;
					queue = false;
				}
			}
		} else if (queue == false) {
			// No more queue items, trigger callback.
			downloadQueue = [];
			listAllProductImages();
			if (callback) callback(downloaded, failed);
		} else {
			console.error("No images to download.");
			if (callback) callback(false);
		}
		
		if (fromURL) {
			download(fromURL, imageDirectory)
			.then(file => {
				downloadProductImage(queue, callback, downloaded, failed);
			})
			.catch(error => {
				downloadProductImage(queue, callback, downloaded, failed);
			});
		}
	} else {
		if (typeof queue == "string") downloadQueue.push(queue);
	}
}

function getProductInformation() {
	return {systemName: systemName.ui, modelID: settings.modelID, modelName: settings.modelName, productImage: settings.productImage, systemID: systemID};
}

	
	
beo.expressServer.get("/product-information/discovery", function (req, res) {

	res.status(200);
	res.send({name: systemName.ui, serviceType: "beocreate", advertisePort: beo.systemConfiguration.port, txtRecord: {"type": settings.modelID, "typeui": settings.modelName, "id": systemID, "image": currentProductImage, "status": systemStatus}});
		
});
	
	

	
module.exports = {
	getProductInformation: getProductInformation,
	setProductIdentity: setProductModel,
	getProductIdentity: getProductIdentity,
	getProductImage: getProductImage,
	addProductIdentity: checkAndAddProductIdentity,
	deleteProductIdentity: deleteProductIdentity,
	version: version
};




